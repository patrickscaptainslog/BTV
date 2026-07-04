"use client";

import { useEffect, useRef, useState } from "react";
import { getStoreSnapshot, onStoreChange, replaceStore, type Store } from "@/lib/storage";

type SyncState = "off" | "unauthed" | "syncing" | "synced" | "error";

const PUSH_DEBOUNCE_MS = 4000;

/**
 * Keeps localStorage and the server store in step (last-write-wins by
 * updatedAt). On load: pull if the server is newer, push if local is newer.
 * After any local mutation: debounce-push. Silent and tiny in the header.
 */
export default function SyncIndicator() {
  const [state, setState] = useState<SyncState>("off");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<SyncState>("off");
  stateRef.current = state;

  const push = async () => {
    const local = getStoreSnapshot();
    if (local.updatedAt === 0) return; // nothing to push
    setState("syncing");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (res.status === 409) {
        // Server is newer — pull it instead.
        await pull();
        return;
      }
      if (res.status === 401) return setState("unauthed");
      if (res.status === 503) return setState("off");
      setState(res.ok ? "synced" : "error");
    } catch {
      setState("error");
    }
  };

  const pull = async () => {
    try {
      const res = await fetch("/api/sync");
      if (res.status === 401) return setState("unauthed");
      if (res.status === 503) return setState("off");
      if (!res.ok) return setState("error");
      const data = (await res.json()) as { updatedAt: number; store: Store | null };
      const local = getStoreSnapshot();
      if (data.store && data.updatedAt > local.updatedAt) {
        replaceStore(data.store);
        setState("synced");
        // Reload so every page picks up the fresher data.
        window.location.reload();
        return;
      }
      if (local.updatedAt > data.updatedAt) {
        await push();
        return;
      }
      setState("synced");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    pull();
    const unsub = onStoreChange(() => {
      if (stateRef.current === "off" || stateRef.current === "unauthed") return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(push, PUSH_DEBOUNCE_MS);
    });
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        // Best-effort final push; sendBeacon keeps it alive through unload.
        const local = getStoreSnapshot();
        if (local.updatedAt > 0 && navigator.sendBeacon) {
          navigator.sendBeacon("/api/sync", new Blob([JSON.stringify(local)], { type: "application/json" }));
        }
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      unsub();
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label: Record<SyncState, { text: string; cls: string; title: string }> = {
    off: { text: "local only", cls: "text-slate-400", title: "Cross-device sync is not configured (add a KV store in Vercel)" },
    unauthed: { text: "local only", cls: "text-slate-400", title: "Sign in on the Login page to sync progress across devices" },
    syncing: { text: "syncing…", cls: "text-sky-500", title: "Pushing progress to the server" },
    synced: { text: "synced", cls: "text-green-600 dark:text-green-400", title: "Progress is synced across your devices" },
    error: { text: "sync error", cls: "text-amber-600", title: "Couldn't reach the sync server — progress is still saved locally" },
  };
  const l = label[state];
  return (
    <span className={`ml-auto text-[11px] whitespace-nowrap ${l.cls}`} title={l.title}>
      ● {l.text}
    </span>
  );
}
