import { fetchRentRoll, fetchUnitVacancy, fetchFutureTenants, getManualOverrides } from "@/lib/appfolio";
import { buildDashboardData } from "@/lib/leasing";
import { dashboardToCsv } from "@/lib/export";
import { getLeaseStatuses } from "@/lib/leaseStatus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rentRoll = await fetchRentRoll();
    const vacancyRows = await fetchUnitVacancy();
    const futureTenants = await fetchFutureTenants();

    if (rentRoll.length === 0) {
      return new Response("AppFolio returned 0 rent-roll rows — try again.", { status: 503 });
    }

    const overrides = getManualOverrides();
    const augmentedRoll = overrides.length > 0 ? [...rentRoll, ...overrides] : rentRoll;
    const data = await buildDashboardData(augmentedRoll, vacancyRows, futureTenants);
    const leaseStatuses = await getLeaseStatuses();

    const csv = dashboardToCsv(data, leaseStatuses);
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Prepend UTF-8 BOM so Excel opens accented names correctly.
    const body = "﻿" + csv;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leasing-report-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Export failed: ${msg}`, { status: 500 });
  }
}
