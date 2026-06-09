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
  if (res.status === 429) return { ok: false, status: 429 };
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { results?: unknown[] };
    return { ok: true, total: (j.results as unknown[] ?? []).length, rows: j.results ?? [] };
  } catch { return { ok: false, status: res.status, body: text.slice(0, 200) }; }
}

export async function GET() {
  // Confirmed working: tenant_statuses: ["2"] returns future tenants
  // Fetch both aged_receivables_detail and rent_roll with this filter to see full fields
  const ar = await postReport("aged_receivables_detail", { tenant_statuses: ["2"] });
  await new Promise(r => setTimeout(r, 2500));
  const rr = await postReport("rent_roll", { tenant_statuses: ["2"] });

  return NextResponse.json({ aged_receivables_future: ar, rent_roll_future: rr });
}
