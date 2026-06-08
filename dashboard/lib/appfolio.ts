import "server-only";
import { unstable_cache } from "next/cache";

const BASE =
  `https://${process.env.APPFOLIO_DATABASE}.appfolio.com/api/v2/reports`;

function basicAuth(): string {
  const id = process.env.APPFOLIO_CLIENT_ID;
  const secret = process.env.APPFOLIO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing APPFOLIO_CLIENT_ID or APPFOLIO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

interface ReportResponse {
  results: {
    data: Record<string, unknown>[];
    next_page_url?: string;
  };
}

async function fetchAllPages(
  url: string,
  auth: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let next: string | null = url;

  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AppFolio API ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as ReportResponse;
    rows.push(...(json.results?.data ?? []));
    next = json.results?.next_page_url ?? null;

    // Brief pause between pages to stay well under rate limit
    if (next) await new Promise((r) => setTimeout(r, 300));
  }

  return rows;
}

export async function fetchReport(
  reportName: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  const auth = basicAuth();
  const qs = new URLSearchParams({ ...params, paginate_results: "true" }).toString();
  const url = `${BASE}/${reportName}.json?${qs}`;
  return fetchAllPages(url, auth);
}

// Try multiple report name candidates, return first that succeeds
async function fetchFirstAvailable(
  candidates: string[],
  params: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  let lastError: Error | null = null;
  for (const name of candidates) {
    try {
      return await fetchReport(name, params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only try next candidate on 404
      if (!lastError.message.includes("404")) throw lastError;
    }
  }
  throw lastError ?? new Error("No valid report found");
}

// Cached fetchers — revalidate every 15 minutes
export const fetchRentRoll = unstable_cache(
  async () => fetchFirstAvailable([
    "tenant_detail",
    "tenant_directory",
    "rent_roll",
    "current_tenant_detail",
  ]),
  ["appfolio-rent-roll"],
  { revalidate: 900, tags: ["appfolio"] }
);

export const fetchUnitVacancy = unstable_cache(
  async () => fetchFirstAvailable([
    "unit_vacancy_detail",
    "unit_vacancy",
    "unit_directory",
    "vacant_unit_detail",
  ]),
  ["appfolio-unit-vacancy"],
  { revalidate: 900, tags: ["appfolio"] }
);

export const fetchCompletedProcesses = unstable_cache(
  async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(today.getTime() + 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return fetchReport("completed_processes", { from_date: from, to_date: to });
  },
  ["appfolio-completed-processes"],
  { revalidate: 900, tags: ["appfolio"] }
);
