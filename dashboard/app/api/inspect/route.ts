import { fetchReport, clearCache } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Try every plausible date-parameter name for AppFolio's rent_roll report.
// We know as_of_date is accepted (no 400) but silently ignored.
export async function GET() {
  clearCache();

  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  // also try MM/DD/YYYY format
  const [y, m, d] = in90.split("-");
  const in90_us = `${m}/${d}/${y}`;

  const PARAM_VARIANTS = [
    { as_of: in90 },
    { report_date: in90 },
    { date: in90 },
    { target_date: in90 },
    { period_end_date: in90 },
    { period_date: in90 },
    { end_date: in90 },
    { as_of_date: in90_us },             // MM/DD/YYYY format
    { report_date: in90_us },
    { from_date: in90, to_date: in90 },  // range collapsed to single day
  ];

  const results: Record<string, unknown>[] = [];
  for (const params of PARAM_VARIANTS) {
    await new Promise((r) => setTimeout(r, 2200));
    try {
      const rows = await fetchReport("rent_roll", params);
      const statuses: Record<string, number> = {};
      for (const r of rows) {
        const s = String(r["status"] ?? "(none)");
        statuses[s] = (statuses[s] ?? 0) + 1;
      }
      // Detect any "Current" rows with future move_in — that's success
      const futureCurrentRows = rows.filter((r) => {
        const mi = String(r["move_in"] ?? "");
        return String(r["status"]).toLowerCase() === "current" && mi >= in90.slice(0, 7);
      }).map((r) => ({ tenant: r["tenant"], unit: r["unit"], move_in: r["move_in"] }));

      results.push({ params, total: rows.length, statuses, future_current_rows: futureCurrentRows });
    } catch (e) {
      results.push({ params, error: e instanceof Error ? e.message.slice(0, 150) : String(e) });
    }
  }

  return NextResponse.json({ target_date: in90, target_date_us: in90_us, results });
}
