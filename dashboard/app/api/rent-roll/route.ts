import { NextRequest, NextResponse } from "next/server";
import { fetchReport } from "@/lib/appfolio";

// Historical rent roll for a specific date.
//
//   /api/rent-roll?as_of=2026-10-02                -> CSV download
//   /api/rent-roll?as_of=2026-10-02&property=Mission
//   /api/rent-roll?as_of=2026-10-02&format=debug   -> how the date param was found
//
// rent_roll_itemized exists on this account, but AppFolio silently ignores
// parameters it doesn't recognise, and its date parameter's name is not in the
// public docs (`as_of_date` was tried first and ignored). So the parameter is
// discovered by observation: pick a probe date that today's data contradicts —
// the day before the latest move-in of anyone currently in place — and keep the
// candidate under which those not-yet-arrived tenants disappear.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPORT = "rent_roll_itemized";
const PARAM_CANDIDATES = [
  "as_of_date",
  "as_of",
  "as_of_to",
  "occurred_on_to",
  "report_date",
  "date",
  "posted_on_to",
];

let discoveredParam: string | null = null; // survives while the instance is warm

type Row = Record<string, unknown>;
const pause = () => new Promise((r) => setTimeout(r, 2500)); // rate limit: ~7 req / 15s

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function inPlace(r: Row) {
  const s = String(r["status"] ?? "").toLowerCase();
  return s === "current" || s.startsWith("notice");
}

// Tenants shown as in place who moved in after `asOf` prove the date was ignored.
function contradictions(rows: Row[], asOf: string) {
  return rows.filter((r) => {
    const mi = String(r["move_in"] ?? "");
    return inPlace(r) && ISO.test(mi) && mi > asOf;
  });
}

function dayBefore(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [cols.map(cell).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
  return lines.join("\n");
}

async function discoverDateParam(log: string[]): Promise<string | null> {
  if (discoveredParam) {
    log.push(`using cached parameter "${discoveredParam}"`);
    return discoveredParam;
  }

  // Baseline (no date) = today. The latest move-in among in-place tenants gives
  // a probe date on which those tenants must NOT appear if the date is honoured.
  const baseline = await fetchReport(REPORT, {});
  const moveIns = baseline
    .filter(inPlace)
    .map((r) => String(r["move_in"] ?? ""))
    .filter((d) => ISO.test(d))
    .sort();
  const latest = moveIns[moveIns.length - 1];
  if (!latest) {
    log.push("baseline has no in-place tenants with a move-in date; cannot probe");
    return null;
  }
  const probe = dayBefore(latest);
  const expected = contradictions(baseline, probe).length;
  log.push(`probe date ${probe}: ${expected} tenant(s) in today's data had not moved in yet`);

  for (const param of PARAM_CANDIDATES) {
    await pause();
    try {
      const rows = await fetchReport(REPORT, { [param]: probe });
      const left = contradictions(rows, probe).length;
      log.push(`"${param}": ${rows.length} rows, ${left} not-yet-arrived tenant(s) still shown`);
      if (left === 0 && rows.length > 0) {
        discoveredParam = param;
        return param;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`"${param}": error — ${msg.slice(0, 120)}`);
      if (/\b(401|403)\b/.test(msg)) return null; // auth fails identically for all
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get("as_of") ?? "";
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  if (!ISO.test(asOf)) {
    return NextResponse.json(
      { error: "Pass ?as_of=YYYY-MM-DD, e.g. /api/rent-roll?as_of=2026-10-02" },
      { status: 400 }
    );
  }

  const log: string[] = [];
  let param: string | null;
  try {
    param = await discoverDateParam(log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, log }, { status: 502 });
  }

  if (!param) {
    return NextResponse.json(
      {
        error: `AppFolio's ${REPORT} report ignored every date parameter tried, so no as-of rent roll can be produced this way.`,
        tried: PARAM_CANDIDATES,
        log,
      },
      { status: 422 }
    );
  }

  await pause();
  const rows = await fetchReport(REPORT, { [param]: asOf });
  const left = contradictions(rows, asOf);
  if (left.length > 0) {
    return NextResponse.json(
      {
        error: `Parameter "${param}" passed the probe but this result still shows tenants who moved in after ${asOf}.`,
        evidence: left.slice(0, 5).map((r) => ({ unit: r["unit"], tenant: r["tenant"], move_in: r["move_in"] })),
        log,
      },
      { status: 422 }
    );
  }

  const filtered = property
    ? rows.filter((r) =>
        String(r["property_name"] ?? "").toLowerCase().includes(property.toLowerCase())
      )
    : rows;

  if (format === "debug" || format === "json") {
    return NextResponse.json({
      as_of: asOf,
      report: REPORT,
      date_param: param,
      log,
      total_rows: rows.length,
      returned_rows: filtered.length,
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
