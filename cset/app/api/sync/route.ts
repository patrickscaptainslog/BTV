import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { kvConfigured, kvGet, kvSet } from "@/lib/kv";

export const dynamic = "force-dynamic";

const KEY = "cset:store:v1";
const MAX_BYTES = 2 * 1024 * 1024;

/** GET: fetch the server copy of the progress store (or updatedAt: 0 if none). */
export async function GET() {
  if (!isAuthorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!kvConfigured()) return NextResponse.json({ configured: false }, { status: 503 });
  try {
    const raw = await kvGet(KEY);
    if (!raw) return NextResponse.json({ configured: true, updatedAt: 0, store: null });
    const store = JSON.parse(raw) as { updatedAt?: number };
    return NextResponse.json({ configured: true, updatedAt: store.updatedAt ?? 0, store });
  } catch {
    return NextResponse.json({ error: "KV read failed" }, { status: 502 });
  }
}

/** POST: replace the server copy if the client's is newer (last-write-wins). */
export async function POST(req: Request) {
  if (!isAuthorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!kvConfigured()) return NextResponse.json({ configured: false }, { status: 503 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Store too large" }, { status: 413 });

  let incoming: { updatedAt?: number; ratings?: unknown };
  try {
    incoming = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof incoming.updatedAt !== "number" || !("ratings" in incoming)) {
    return NextResponse.json({ error: "Not a progress store" }, { status: 400 });
  }

  try {
    const existing = await kvGet(KEY);
    if (existing) {
      const cur = JSON.parse(existing) as { updatedAt?: number };
      if ((cur.updatedAt ?? 0) > incoming.updatedAt) {
        // Server copy is newer — reject so the client pulls instead.
        return NextResponse.json({ conflict: true, updatedAt: cur.updatedAt }, { status: 409 });
      }
    }
    await kvSet(KEY, raw);
    return NextResponse.json({ ok: true, updatedAt: incoming.updatedAt });
  } catch {
    return NextResponse.json({ error: "KV write failed" }, { status: 502 });
  }
}
