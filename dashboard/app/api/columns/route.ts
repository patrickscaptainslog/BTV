import { NextResponse } from "next/server";

async function post(reportName: string) {
  const id = process.env.APPFOLIO_CLIENT_ID!;
  const secret = process.env.APPFOLIO_CLIENT_SECRET!;
  const db = process.env.APPFOLIO_DATABASE!;
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const url = `https://${db}.appfolio.com/api/v2/reports/${reportName}.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ paginate_results: true }),
    cache: "no-store",
  });

  if (!res.ok) return { error: `${res.status}`, columns: [], sample: null };

  const json = await res.json() as { results?: { data?: Record<string, unknown>[] } };
  const rows = json.results?.data ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const sample = rows.length > 0 ? rows[0] : null;

  return { rows: rows.length, columns, sample };
}

export async function GET() {
  await new Promise((r) => setTimeout(r, 500));
  const rentRoll = await post("rent_roll");
  await new Promise((r) => setTimeout(r, 3000));
  const vacancy = await post("unit_vacancy");

  return NextResponse.json({ rent_roll: rentRoll, unit_vacancy: vacancy });
}
