import { NextRequest, NextResponse } from "next/server";
import { fetchReport } from "@/lib/appfolio";

// Historical rent roll for a specific date.
//
//   /api/rent-roll?as_of=2026-10-02                -> CSV download
//   /api/rent-roll?as_of=2026-10-02&property=Mission
//   /api/rent-roll?as_of=2026-10-02&format=debug   -> which report/param worked
//
// AppFolio exposes the as-of rent roll through `rent_roll_itemized` (required
// `as_of_date`), NOT through plain `rent_roll`, which ignores date parameters
// and always answers for today. The exact report/param naming is not in
// AppFolio's public docs, so try the plausible combinations in order and
// report which one answered.
export const dynamic = "force-dynamic";

// Plain rent_roll is deliberately absent: it ignores every date parameter and
// answers for today, so falling back to it labels today's data as the past.
const CANDIDATES: { report: string; param: string }[] = [
  { report: "rent_roll_itemized", param: "as_of_date" },
  { report: "rent_roll_itemized", param: "as_of" },
  { report: "rent_roll_itemized", param: "occurred_on_to" },
];

// A tenant shown as in place whose move-in is after the as-of date proves the
// report ignored the date. Returns those rows so the caller can refuse.
function rowsContradictingDate(rows: Record<string, unknown>[], asOf: string) {
  return rows.filter((r) => {
    const status = String(r["status"] ?? "").toLowerCase();
    const inPlace = status === "current" || status.startsWith("notice");
    const moveIn = String(r["move_in"] ?? "");
    return inPlace && /^\d{4}-\d{2}-\d{2}$/.test(moveIn) && moveIn > asOf;
  });
}

function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [cols.map(cell).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get("as_of") ?? "";
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json(
      { error: "Pass ?as_of=YYYY-MM-DD, e.g. /api/rent-roll?as_of=2026-10-02" },
      { status: 400 }
    );
  }

  const attempts: { report: string; param: string; result: string }[] = [];
  let rows: Record<string, unknown>[] | null = null;
  let used: { report: string; param: string } | null = null;

  for (const c of CANDIDATES) {
    try {
      const got = await fetchReport(c.report, { [c.param]: asOf });
      attempts.push({ ...c, result: `ok — ${got.length} rows` });
      rows = got;
      used = c;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ ...c, result: msg.slice(0, 160) });
      // A 404 means that report does not exist on this account; anything else
      // (401/403/429) will fail the same way for every candidate, so stop.
      if (!/\b404\b/.test(msg)) break;
      await new Promise((r) => setTimeout(r, 2500)); // respect the rate limit
    }
  }

  if (!rows || !used) {
    return NextResponse.json(
      {
        error: "No rent-roll report accepted an as-of date on this account.",
        as_of: asOf,
        attempts,
        hint: "Check the report names your AppFolio account exposes; attempts shows what each returned.",
      },
      { status: 502 }
    );
  }

  const filtered = property
    ? rows.filter((r) =>
        String(r["property_name"] ?? "").toLowerCase().includes(property.toLowerCase())
      )
    : rows;

  const contradictions = rowsContradictingDate(rows, asOf);
  if (contradictions.length > 0 && format !== "debug") {
    return NextResponse.json(
      {
        error: `AppFolio ignored the as-of date: this is not a rent roll for ${asOf}.`,
        as_of: asOf,
        used,
        evidence: contradictions.slice(0, 5).map((r) => ({
          unit: r["unit"],
          tenant: r["tenant"],
          status: r["status"],
          move_in: r["move_in"],
        })),
        hint: "These tenants are shown as in place but moved in after the as-of date. Open with &format=debug to see every attempt.",
      },
      { status: 422 }
    );
  }

  if (format === "debug" || format === "json") {
    return NextResponse.json({
      as_of: asOf,
      used,
      attempts,
      property_filter: property || null,
      date_respected: contradictions.length === 0,
      contradicting_rows: contradictions.length,
      total_rows: rows.length,
      returned_rows: filtered.length,
      columns: filtered.length > 0 ? Object.keys(filtered[0]) : [],
      rows: format === "debug" ? filtered.slice(0, 3) : filtered,
    });
  }

  const slug = property ? property.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") : "all";
  return new Response("﻿" + toCsv(filtered), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rent-roll-${slug}-${asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
