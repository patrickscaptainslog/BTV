import { fetchRentRoll } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await fetchRentRoll();

  // Distinct status values with counts
  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    const s = String(r["status"] ?? "(none)");
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Slim view of key fields for every row
  const slim = rows.map((r) => ({
    property_name: r["property_name"],
    unit: r["unit"],
    tenant: r["tenant"],
    status: r["status"],
    move_in: r["move_in"],
    move_out: r["move_out"],
    lease_from: r["lease_from"],
    lease_to: r["lease_to"],
  }));

  // Rows of interest: future-looking or named tenants the user mentioned
  const interesting = slim.filter((r) => {
    const t = String(r.tenant ?? "").toLowerCase();
    const s = String(r.status ?? "").toLowerCase();
    return t.includes("adrien") || t.includes("gabriel") ||
      s.includes("vacant") || s.includes("future") || String(r.unit ?? "") === "7";
  });

  return NextResponse.json({
    total_rows: rows.length,
    distinct_properties: Array.from(new Set(slim.map((r) => r.property_name))),
    statusCounts,
    interesting,
  });
}
