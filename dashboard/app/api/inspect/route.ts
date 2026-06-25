import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authHeader() {
  return "Basic " + Buffer.from(`${process.env.APPFOLIO_CLIENT_ID}:${process.env.APPFOLIO_CLIENT_SECRET}`).toString("base64");
}
const base = `https://${process.env.APPFOLIO_DATABASE}.appfolio.com`;
const hdrs = { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" };

async function postReport(name: string, params: object) {
  const res = await fetch(`${base}/api/v2/reports/${name}.json`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify({ paginate_results: true, ...params }),
    cache: "no-store",
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { results?: unknown[] };
    return { ok: true, status: res.status, rows: (j.results as Record<string, unknown>[]) ?? [] };
  } catch {
    return { ok: false, status: res.status, body: text.slice(0, 300), rows: [] };
  }
}

export async function GET() {
  // Full rent_roll — show all Vacant-Rented rows with every field
  const rr = await postReport("rent_roll", {});
  const vacantRented = rr.rows.filter(r => String(r["status"] ?? "").toLowerCase() === "vacant-rented");

  await new Promise(r => setTimeout(r, 2500));

  // tenant_directory filtered to future tenants (status 2)
  const td2 = await postReport("tenant_directory", { tenant_statuses: ["2"] });

  await new Promise(r => setTimeout(r, 2500));

  // aged_receivables future tenants (what we currently use for names/dates)
  const ar = await postReport("aged_receivables_detail", { tenant_statuses: ["2"] });

  await new Promise(r => setTimeout(r, 2500));

  // tenant_directory current tenants (status 0) — confirms email/phone column names
  const td0 = await postReport("tenant_directory", { tenant_statuses: ["0"] });
  const td0Columns = td0.rows.length > 0 ? Object.keys(td0.rows[0]) : [];

  return NextResponse.json({
    vacant_rented_rows_full: vacantRented,
    tenant_directory_status2: { total: td2.rows.length, rows: td2.rows },
    aged_receivables_status2: { total: ar.rows.length, rows: ar.rows },
    tenant_directory_status0: { total: td0.rows.length, columns: td0Columns, sample: td0.rows.slice(0, 2) },
  });
}
