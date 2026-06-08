import "server-only";
import { unstable_cache } from "next/cache";

function authHeader(): string {
  const id = process.env.APPFOLIO_CLIENT_ID;
  const secret = process.env.APPFOLIO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing APPFOLIO_CLIENT_ID or APPFOLIO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

function baseUrl(): string {
  const db = process.env.APPFOLIO_DATABASE;
  if (!db) throw new Error("Missing APPFOLIO_DATABASE");
  return `https://${db}.appfolio.com/api/v2/reports`;
}

interface ReportResponse {
  results: {
    data: Record<string, unknown>[];
    next_page_url?: string;
  };
}

async function doFetch(url: string, body: Record<string, unknown>): Promise<Response> {
  const headers = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });

  let retries = 0;
  while (res.status === 429 && retries < 3) {
    await new Promise((r) => setTimeout(r, 8000 * (retries + 1)));
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    retries++;
  }

  return res;
}

async function fetchAllPages(
  reportName: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const firstUrl = `${baseUrl()}/${reportName}.json`;
  const body = { ...params, paginate_results: true };

  let res = await doFetch(firstUrl, body);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API ${res.status}: ${text.slice(0, 300)}`);
  }

  let json = (await res.json()) as { results: Record<string, unknown>[] | { data?: Record<string, unknown>[]; next_page_url?: string } };
  // AppFolio returns results as a direct array (not nested under .data)
  const firstPage = Array.isArray(json.results) ? json.results : (json.results?.data ?? []);
  rows.push(...firstPage);

  // Subsequent pages
  const maybeNested = json.results as { next_page_url?: string };
  let nextUrl = Array.isArray(json.results) ? null : (maybeNested?.next_page_url ?? null);
  while (nextUrl) {
    res = await fetch(nextUrl, {
      method: "GET",
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;
    json = (await res.json()) as ReportResponse;
    rows.push(...(json.results?.data ?? []));
    nextUrl = json.results?.next_page_url ?? null;
  }

  return rows;
}

export async function fetchReport(
  reportName: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  return fetchAllPages(reportName, params);
}

async function fetchFirstAvailable(
  candidates: string[],
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  let lastError: Error | null = null;
  for (const name of candidates) {
    try {
      return await fetchReport(name, params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!lastError.message.includes("404")) throw lastError;
    }
  }
  throw lastError ?? new Error("No valid report found");
}

export const fetchRentRoll = unstable_cache(
  async () => fetchFirstAvailable([
    "rent_roll",
    "rent_roll_detail",
    "tenant_detail",
    "tenant_directory",
  ]),
  ["appfolio-rent-roll-v3"],
  { revalidate: 900, tags: ["appfolio"] }
);

export const fetchUnitVacancy = unstable_cache(
  async () => {
    await new Promise((r) => setTimeout(r, 2000));
    return fetchFirstAvailable([
      "unit_vacancy",
      "unit_vacancy_detail",
      "unit_directory",
      "vacant_unit_detail",
    ]);
  },
  ["appfolio-unit-vacancy-v3"],
  { revalidate: 900, tags: ["appfolio"] }
);

export const fetchCompletedProcesses = unstable_cache(
  async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
    return fetchReport("completed_processes", { from_date: from, to_date: to });
  },
  ["appfolio-completed-processes-v3"],
  { revalidate: 900, tags: ["appfolio"] }
);
