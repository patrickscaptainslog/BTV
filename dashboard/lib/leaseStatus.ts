import "server-only";
import type { LeaseStatusEntry, LeaseStatusMap } from "./types";

// ---------------------------------------------------------------------------
// Renewal outreach status persistence.
//
// Backed by Vercel KV / Upstash Redis via its REST API (no extra dependency —
// we just POST command arrays). A single JSON blob holds the whole map, keyed
// by unit_id, which is plenty for a portfolio of this size.
//
// Degrades gracefully: if the KV env vars aren't set yet, reads return an empty
// map and writes throw a clear error the API surfaces to the UI. Once the store
// is provisioned in Vercel and the env vars are present, it just works.
// ---------------------------------------------------------------------------

const KEY = "lease-statuses";

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function kvAvailable(): boolean {
  return kvConfig() !== null;
}

// Run a single Redis command via the Upstash REST API: POST a JSON array body.
async function command(args: (string | number)[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error("KV store not configured (set KV_REST_API_URL and KV_REST_API_TOKEN)");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result;
}

export async function getLeaseStatuses(): Promise<LeaseStatusMap> {
  if (!kvAvailable()) return {};
  try {
    const raw = await command(["GET", KEY]);
    if (typeof raw !== "string" || raw === "") return {};
    return JSON.parse(raw) as LeaseStatusMap;
  } catch {
    // Never let a storage hiccup break the dashboard render.
    return {};
  }
}

export async function setLeaseStatus(unitId: string, entry: LeaseStatusEntry): Promise<LeaseStatusMap> {
  const map = await getLeaseStatuses();
  if (!entry.status && !entry.note.trim()) {
    delete map[unitId]; // clearing both fields removes the entry
  } else {
    map[unitId] = entry;
  }
  await command(["SET", KEY, JSON.stringify(map)]);
  return map;
}
