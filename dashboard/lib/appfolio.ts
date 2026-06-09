import "server-only";

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

// AppFolio v2 response: results is a direct array of row objects,
// and next_page_url (when present) is a TOP-LEVEL sibling of results.
interface ReportResponse {
  results: Record<string, unknown>[] | { data?: Record<string, unknown>[] };
  next_page_url?: string;
}

function extractRows(json: ReportResponse): Record<string, unknown>[] {
  if (Array.isArray(json.results)) return json.results;
  return json.results?.data ?? [];
}

async function postReport(url: string, body: Record<string, unknown>): Promise<Response> {
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

  let res = await postReport(firstUrl, { ...params, paginate_results: true });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API ${res.status}: ${text.slice(0, 300)}`);
  }

  let json = (await res.json()) as ReportResponse;
  rows.push(...extractRows(json));

  // next_page_url is top-level and not rate-limited per AppFolio docs
  let nextUrl = json.next_page_url ?? null;
  let guard = 0;
  while (nextUrl && guard < 50) {
    res = await fetch(nextUrl, {
      method: "GET",
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;
    json = (await res.json()) as ReportResponse;
    rows.push(...extractRows(json));
    nextUrl = json.next_page_url ?? null;
    guard++;
  }

  return rows;
}

export async function fetchReport(
  reportName: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  return fetchAllPages(reportName, params);
}

// Try multiple report name candidates; only fall through on a 404
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

// ---------------------------------------------------------------------------
// Module-scope in-memory TTL cache.
// Lives only for the lifetime of a warm serverless instance, so it can NEVER
// persist a bad value across deployments (unlike unstable_cache / Data Cache).
// Empty results are never cached — a transient empty response self-heals.
// ---------------------------------------------------------------------------
type CacheEntry = { at: number; rows: Record<string, unknown>[] };
const memCache = new Map<string, CacheEntry>();
const TTL_MS = 15 * 60 * 1000; // 15 minutes

async function cached(
  key: string,
  loader: () => Promise<Record<string, unknown>[]>
): Promise<Record<string, unknown>[]> {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const rows = await loader();
  if (rows.length > 0) memCache.set(key, { at: Date.now(), rows });
  return rows;
}

export function clearCache() {
  memCache.clear();
}

export const fetchRentRoll = () =>
  cached("rent-roll", () =>
    fetchFirstAvailable(["rent_roll", "rent_roll_detail", "tenant_detail", "tenant_directory"]));

export const fetchUnitVacancy = async () => {
  await new Promise((r) => setTimeout(r, 2000)); // space out from rent roll fetch
  return cached("unit-vacancy", () =>
    fetchFirstAvailable(["unit_vacancy", "unit_vacancy_detail", "unit_directory", "vacant_unit_detail"]));
};

// tenant_directory has full details for ALL leases (current, future, notice-giving).
// Future tenants are identifiable by a move_in date in the future — rent_roll
// omits those details for "Vacant-Rented" rows, so this is the primary source
// for the upcoming move-ins list.
export const fetchTenantDirectory = () =>
  cached("tenant-directory", async () => {
    await new Promise((r) => setTimeout(r, 4000)); // space out: rent-roll + unit-vacancy first
    return fetchReport("tenant_directory");
  });

// ---------------------------------------------------------------------------
// Manual move-in overrides
// AppFolio's Reports API never exposes future tenants for Vacant-Rented units
// (tenant/date fields are null in every report). Set MOVE_IN_OVERRIDES in
// Vercel env vars as a JSON array to fill the gap:
//
//   [{"property_name":"15th","unit":"6 - 6","tenant":"Gabriel L","move_in":"2026-06-12","rent":"1500.00"},
//    {"property_name":"15th","unit":"21 - 21","tenant":"Adrien M","move_in":"2026-08-01","rent":"1500.00"}]
//
// These are merged into the rent roll as synthetic "Future" rows so the
// normal move-in detection picks them up automatically.
// ---------------------------------------------------------------------------
export function getManualOverrides(): Record<string, unknown>[] {
  const raw = process.env.MOVE_IN_OVERRIDES;
  if (!raw) return [];
  try {
    const overrides = JSON.parse(raw) as Record<string, unknown>[];
    return overrides.map((o) => ({ status: "Future", ...o }));
  } catch {
    console.error("MOVE_IN_OVERRIDES parse error — must be valid JSON array");
    return [];
  }
}
