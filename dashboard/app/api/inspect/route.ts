import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authHeader() {
  return "Basic " + Buffer.from(`${process.env.APPFOLIO_CLIENT_ID}:${process.env.APPFOLIO_CLIENT_SECRET}`).toString("base64");
}
const base = `https://${process.env.APPFOLIO_DATABASE}.appfolio.com`;
const hdrs = { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" };

async function postReport(name: string, params: object) {
  const url = `${base}/api/v2/reports/${name}.json`;
  const res = await fetch(url, { method: "POST", headers: hdrs, body: JSON.stringify({ paginate_results: true, ...params }), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 300) };
  try {
    const j = JSON.parse(text) as { results?: unknown[] };
    const rows = Array.isArray(j.results) ? j.results : [];
    return {
      ok: true,
      total: rows.length,
      sample: rows.slice(0, 2).map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return { tenant: row.tenant, unit: row.unit, property_name: row.property_name, status: row.status, move_in: row.move_in, lease_from: row.lease_from };
      }),
    };
  } catch { return { ok: false, status: res.status, body: text.slice(0, 300) }; }
}

async function getV1(path: string) {
  const res = await fetch(`${base}${path}`, { method: "GET", headers: hdrs, cache: "no-store" });
  return { status: res.status, body: (await res.text()).slice(0, 400) };
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // aged_receivables_detail with tenant_statuses "2" = Future
  // If this filter works, it likely works on rent_roll too
  results["aged_recv_future_2"] = await postReport("aged_receivables_detail", { tenant_statuses: "2" });
  await new Promise(r => setTimeout(r, 2200));

  results["aged_recv_future_array"] = await postReport("aged_receivables_detail", { tenant_statuses: ["2"] });
  await new Promise(r => setTimeout(r, 2200));

  // rent_roll with tenant_statuses filter
  results["rent_roll_tenant_status_2"] = await postReport("rent_roll", { tenant_statuses: "2" });
  await new Promise(r => setTimeout(r, 2200));

  results["rent_roll_tenant_status_Future"] = await postReport("rent_roll", { tenant_statuses: "Future" });
  await new Promise(r => setTimeout(r, 2200));

  // rental_applications report
  results["rental_applications"] = await postReport("rental_applications", {});
  await new Promise(r => setTimeout(r, 2200));

  // AppFolio v1 REST API — different base path than v2 reports
  results["v1_rent_roll_GET"] = await getV1("/api/v1/rent_roll");
  await new Promise(r => setTimeout(r, 2200));

  results["v1_leases_GET"] = await getV1("/api/v1/leases");
  await new Promise(r => setTimeout(r, 2200));

  results["v1_occupancies_GET"] = await getV1("/api/v1/occupancies");

  return NextResponse.json(results);
}
