import { NextResponse } from "next/server";
import { getLeaseStatuses, setLeaseStatus, kvAvailable } from "@/lib/leaseStatus";
import type { ContactStatus, LeaseStatusEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: ContactStatus[] = ["contacted", "renewing", "not-renewing", "no-reply"];

export async function GET() {
  const statuses = await getLeaseStatuses();
  return NextResponse.json({ kv: kvAvailable(), statuses });
}

export async function POST(req: Request) {
  if (!kvAvailable()) {
    return NextResponse.json(
      { ok: false, error: "Storage not configured. Add a Vercel KV store and its env vars." },
      { status: 503 }
    );
  }

  let body: { unit_id?: string; status?: string; note?: string; tenant_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const unitId = String(body.unit_id ?? "").trim();
  if (!unitId) return NextResponse.json({ ok: false, error: "unit_id required" }, { status: 400 });

  const status = String(body.status ?? "");
  if (status !== "" && !VALID.includes(status as ContactStatus)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const entry: LeaseStatusEntry = {
    status: status as ContactStatus | "",
    note: String(body.note ?? "").slice(0, 500),
    tenant_name: String(body.tenant_name ?? ""),
    updated_at: new Date().toISOString(),
  };

  try {
    await setLeaseStatus(unitId, entry);
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
