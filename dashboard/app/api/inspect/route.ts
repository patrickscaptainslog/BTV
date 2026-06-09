import { fetchReport } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Probe multiple AppFolio report candidates to find future tenant details.
// Vacant-Rented rows in rent_roll have null tenant/date — another report
// must hold that data (Adrien Jun 12, Gabriel Aug 1).
const PROBE_REPORTS = [
  "tenant_detail",
  "tenant_directory",
  "future_tenants",
  "prospective_tenants",
  "upcoming_leases",
  "lease_detail",
  "in_progress_workflows",
];

async function tryReport(name: string): Promise<{ ok: boolean; rows: number; sample: unknown[] }> {
  try {
    const rows = await fetchReport(name);
    return { ok: true, rows: rows.length, sample: rows.slice(0, 2) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, rows: 0, sample: [msg.slice(0, 120)] };
  }
}

export async function GET() {
  // Fetch rent_roll first
  const rentRoll = await fetchReport("rent_roll");

  const statusCounts: Record<string, number> = {};
  for (const r of rentRoll) {
    const s = String(r["status"] ?? "(none)");
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const vacantRented = rentRoll
    .filter((r) => String(r["status"] ?? "").toLowerCase() === "vacant-rented")
    .map((r) => ({
      property_name: r["property_name"],
      unit: r["unit"],
      tenant: r["tenant"],
      status: r["status"],
      move_in: r["move_in"],
      move_out: r["move_out"],
      lease_from: r["lease_from"],
      lease_to: r["lease_to"],
    }));

  // Probe candidate reports sequentially (rate-limit aware)
  const probes: Record<string, unknown> = {};
  for (const name of PROBE_REPORTS) {
    probes[name] = await tryReport(name);
    await new Promise((r) => setTimeout(r, 2500));
  }

  return NextResponse.json({
    total_rent_roll: rentRoll.length,
    statusCounts,
    vacant_rented_units: vacantRented,
    report_probes: probes,
  });
}
