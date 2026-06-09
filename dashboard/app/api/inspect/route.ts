import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authHeader(): string {
  const id = process.env.APPFOLIO_CLIENT_ID;
  const secret = process.env.APPFOLIO_CLIENT_SECRET;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}
const base = `https://${process.env.APPFOLIO_DATABASE}.appfolio.com`;

async function probe(label: string, url: string, method = "GET", body?: object) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
    return { label, status: res.status, total: Array.isArray((parsed as Record<string,unknown>)?.results) ? ((parsed as Record<string,unknown>).results as unknown[]).length : "n/a", sample: text.slice(0, 500) };
  } catch (e) {
    return { label, error: String(e).slice(0, 200) };
  }
}

export async function GET() {
  const future = "2026-08-08";
  const results = [];

  // 1. Date as URL query string (not POST body)
  results.push(await probe(
    "rent_roll?as_of_date=query_string",
    `${base}/api/v2/reports/rent_roll.json?as_of_date=${future}`,
    "POST", { paginate_results: true }
  ));
  await new Promise(r => setTimeout(r, 2200));

  // 2. AppFolio v1 REST API — entity-level endpoints (GET)
  for (const path of ["/api/v1/leases", "/api/v1/occupancies", "/api/v1/tenants", "/api/v1/units", "/api/v1/lease_terms"]) {
    results.push(await probe(`v1 GET ${path}`, `${base}${path}`, "GET"));
    await new Promise(r => setTimeout(r, 2200));
  }

  // 3. More report name candidates
  for (const name of ["future_occupancies", "occupancy_history", "move_in_schedule", "scheduled_move_ins", "upcoming_occupancies", "lease_expirations"]) {
    results.push(await probe(
      `report: ${name}`,
      `${base}/api/v2/reports/${name}.json`,
      "POST", { paginate_results: true }
    ));
    await new Promise(r => setTimeout(r, 2200));
  }

  return NextResponse.json({ future_date: future, results });
}
