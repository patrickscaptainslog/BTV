/**
 * Run this once to verify AppFolio credentials and discover available report
 * columns before wiring up the dashboard.
 *
 * Usage:
 *   cp .env.example .env.local   # then fill in real values
 *   npx dotenv -e .env.local -- npx tsx scripts/check-appfolio.ts
 *
 * Output is printed to stdout only — nothing is written to disk.
 * Never commit .env.local or the output of this script.
 */

import * as fs from "fs";
import * as path from "path";

// Manual .env.local loader (avoid importing server-only next modules here)
function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌  .env.local not found — copy .env.example and fill in real values.");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function probe(reportName: string, params: Record<string, string> = {}) {
  const id = process.env.APPFOLIO_CLIENT_ID!;
  const secret = process.env.APPFOLIO_CLIENT_SECRET!;
  const db = process.env.APPFOLIO_DATABASE!;
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const qs = new URLSearchParams({ ...params, paginate_results: "true" }).toString();
  const url = `https://${db}.appfolio.com/api/v2/reports/${reportName}.json?${qs}`;

  console.log(`\n→ ${reportName}`);
  console.log(`  URL: ${url.replace(auth, "[redacted]")}`);

  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
  });

  if (!res.ok) {
    console.log(`  ❌  ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.log(`     ${body.slice(0, 200)}`);
    return;
  }

  const json = (await res.json()) as { results?: { data?: Record<string, unknown>[] } };
  const rows = json.results?.data ?? [];
  console.log(`  ✅  ${rows.length} rows returned`);

  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    console.log(`  Columns (${columns.length}):`);
    columns.forEach((c) => console.log(`    • ${c}: ${JSON.stringify(rows[0][c])}`));
  }
}

async function main() {
  loadEnv();
  console.log("=== AppFolio Reports API probe ===");
  console.log(`Database: ${process.env.APPFOLIO_DATABASE}`);

  const today = new Date().toISOString().slice(0, 10);
  const past30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  await probe("rent_roll");
  await probe("unit_vacancy");
  await probe("in_progress_workflows");
  await probe("completed_processes", { from_date: past30, to_date: today });

  console.log("\n=== Done ===");
  console.log("Copy the column names above into lib/leasing.ts str()/num()/nullable() calls.");
}

main().catch((e) => { console.error(e); process.exit(1); });
