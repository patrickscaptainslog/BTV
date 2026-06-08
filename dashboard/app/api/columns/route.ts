import { NextResponse } from "next/server";

async function tryFetch(reportName: string, method: string, queryParams: string, body?: string) {
  const id = process.env.APPFOLIO_CLIENT_ID!;
  const secret = process.env.APPFOLIO_CLIENT_SECRET!;
  const db = process.env.APPFOLIO_DATABASE!;
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const url = `https://${db}.appfolio.com/api/v2/reports/${reportName}.json${queryParams}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    ...(body ? { body } : {}),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { method, queryParams, body: body ?? null, status: res.status, error: text.slice(0, 100) };

  try {
    const json = JSON.parse(text) as { results?: { data?: Record<string, unknown>[] } };
    const rows = json.results?.data ?? [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const sample = rows.length > 0 ? rows[0] : null;
    return { method, queryParams, body: body ?? null, status: res.status, rows: rows.length, columns, sample };
  } catch {
    return { method, queryParams, body: body ?? null, status: res.status, rawSnippet: text.slice(0, 200) };
  }
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const attempts = [
    () => tryFetch("rent_roll", "GET", "?paginate_results=true"),
    () => tryFetch("rent_roll", "GET", ""),
    () => tryFetch("rent_roll", "POST", "", "{}"),
    () => tryFetch("rent_roll", "POST", "", JSON.stringify({ paginate_results: true })),
    () => tryFetch("rent_roll", "POST", "?paginate_results=true", "{}"),
    () => tryFetch("rent_roll", "GET", `?as_of_date=${today}`),
  ];

  const results = [];
  for (const attempt of attempts) {
    await new Promise((r) => setTimeout(r, 2500));
    results.push(await attempt());
  }

  return NextResponse.json(results);
}
