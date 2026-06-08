import { NextResponse } from "next/server";

const CANDIDATES = [
  // Leasing / tenant candidates
  "tenant_detail",
  "tenant_directory",
  "rent_roll",
  "rent_roll_detail",
  "current_tenant_detail",
  "residential_tenants",
  "resident_directory",
  "active_leases",
  "lease_detail",
  "lease_expiration_detail",
  "current_leases",
  "tenants",
  "leases",
  // Unit / vacancy candidates
  "unit_vacancy_detail",
  "unit_vacancy",
  "unit_directory",
  "vacant_unit_detail",
  "units",
  "occupancy_detail",
  // Known working financial reports (auth check)
  "chart_of_accounts",
  "aged_receivables_detail",
  "completed_processes",
  "in_progress_workflows",
];

export async function GET() {
  const id = process.env.APPFOLIO_CLIENT_ID;
  const secret = process.env.APPFOLIO_CLIENT_SECRET;
  const db = process.env.APPFOLIO_DATABASE;
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const base = `https://${db}.appfolio.com/api/v2/reports`;

  const results: Record<string, string> = {};

  for (const name of CANDIDATES) {
    await new Promise((r) => setTimeout(r, 400)); // stay under 7 req/15s rate limit
    try {
      const res = await fetch(`${base}/${name}.json?paginate_results=true`, {
        headers: { Authorization: auth, Accept: "application/json" },
        cache: "no-store",
      });
      const body = await res.text();
      if (res.ok) {
        const json = JSON.parse(body);
        const rows = json.results?.data ?? [];
        const cols = rows.length > 0 ? Object.keys(rows[0]).join(", ") : "(no rows)";
        results[name] = `✅ ${rows.length} rows | columns: ${cols}`;
      } else {
        results[name] = `❌ ${res.status}`;
      }
    } catch (e) {
      results[name] = `💥 ${String(e)}`;
    }
  }

  return NextResponse.json({ database: db, results });
}
