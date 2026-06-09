import { fetchReport, clearCache } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Force fresh data
  clearCache();

  const rentRoll = await fetchReport("rent_roll");
  await new Promise((r) => setTimeout(r, 2500));
  const tenantDir = await fetchReport("tenant_directory");

  const today = new Date().toISOString().slice(0, 10);

  // All distinct status values in tenant_directory
  const tdStatuses: Record<string, number> = {};
  for (const r of tenantDir) {
    const s = String(r["status"] ?? "(none)");
    tdStatuses[s] = (tdStatuses[s] ?? 0) + 1;
  }

  // Tenant_directory rows with a FUTURE move_in date (>= today)
  const futureMoveIns = tenantDir
    .filter((r) => {
      const mi = r["move_in"];
      return mi != null && String(mi) >= today;
    })
    .map((r) => ({
      property_name: r["property_name"],
      unit: r["unit"],
      unit_id: r["unit_id"],
      tenant: r["tenant"],
      status: r["status"],
      move_in: r["move_in"],
      lease_from: r["lease_from"],
      lease_to: r["lease_to"],
    }));

  // Rent_roll Vacant-Rented rows for cross-reference
  const vacantRented = rentRoll
    .filter((r) => String(r["status"] ?? "") === "Vacant-Rented")
    .map((r) => ({
      property_name: r["property_name"],
      unit: r["unit"],
      unit_id: r["unit_id"],
      tenant: r["tenant"],
      move_in: r["move_in"],
    }));

  return NextResponse.json({
    today,
    total_tenant_directory: tenantDir.length,
    td_statuses: tdStatuses,
    future_move_ins_in_td: futureMoveIns,
    vacant_rented_in_rent_roll: vacantRented,
  });
}
