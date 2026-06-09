import { fetchReport, clearCache } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Probe whether rent_roll accepts a future date parameter.
// AppFolio often uses "as_of_date" for point-in-time rent rolls.
export async function GET() {
  clearCache();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const in60 = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
  const in90 = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);

  // Fetch today's roll first
  const currentRoll = await fetchReport("rent_roll");
  await new Promise((r) => setTimeout(r, 2500));

  // Try future date with as_of_date param
  let futureRoll: Record<string, unknown>[] = [];
  let futureError = "";
  try {
    futureRoll = await fetchReport("rent_roll", { as_of_date: in60 });
  } catch (e) {
    futureError = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }

  // Status counts for each roll
  const countStatuses = (rows: Record<string, unknown>[]) => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const s = String(r["status"] ?? "(none)");
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  };

  // Rows that differ between current and future (potential move-ins)
  const currentByUnit = new Map(currentRoll.map((r) => [
    String(r["property_name"]) + "|" + String(r["unit"]), r
  ]));
  const newInFuture = futureRoll.filter((r) => {
    const key = String(r["property_name"]) + "|" + String(r["unit"]);
    const cur = currentByUnit.get(key);
    return !cur || String(cur["status"]) !== String(r["status"]);
  }).map((r) => ({
    property_name: r["property_name"],
    unit: r["unit"],
    tenant: r["tenant"],
    status_now: currentByUnit.get(String(r["property_name"]) + "|" + String(r["unit"]))?.[
      "status"
    ],
    status_future: r["status"],
    move_in: r["move_in"],
    lease_from: r["lease_from"],
  }));

  return NextResponse.json({
    today: todayStr,
    in30,
    in60,
    in90,
    current_roll_rows: currentRoll.length,
    current_roll_statuses: countStatuses(currentRoll),
    future_roll_rows: futureRoll.length,
    future_roll_error: futureError || null,
    future_roll_statuses: countStatuses(futureRoll),
    status_changes: newInFuture,
  });
}
