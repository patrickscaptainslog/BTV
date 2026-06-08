import { NextResponse } from "next/server";

async function rawPost(reportName: string, body: Record<string, unknown>) {
  const id = process.env.APPFOLIO_CLIENT_ID!;
  const secret = process.env.APPFOLIO_CLIENT_SECRET!;
  const db = process.env.APPFOLIO_DATABASE!;
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const url = `https://${db}.appfolio.com/api/v2/reports/${reportName}.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  return { status: res.status, body, raw: text.slice(0, 1000) };
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  const r1 = await rawPost("rent_roll", {});
  await new Promise((r) => setTimeout(r, 3000));
  const r2 = await rawPost("rent_roll", { as_of_date: today });
  await new Promise((r) => setTimeout(r, 3000));
  const r3 = await rawPost("rent_roll", { paginate_results: true, as_of_date: today });

  return NextResponse.json({ r1, r2, r3 });
}
