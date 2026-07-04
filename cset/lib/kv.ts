import "server-only";

/**
 * Minimal Upstash Redis REST client for the single sync blob. Supports both
 * env naming conventions: Vercel KV injects KV_REST_API_URL/TOKEN; the
 * Upstash marketplace integration injects UPSTASH_REDIS_REST_URL/TOKEN.
 * When neither is configured, sync is simply off — the app stays
 * localStorage-only and the client shows a hint.
 */

function config(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function kvConfigured(): boolean {
  return config() !== null;
}

export async function kvGet(key: string): Promise<string | null> {
  const c = config();
  if (!c) throw new Error("KV not configured");
  const res = await fetch(`${c.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${c.token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
  const data = (await res.json()) as { result: string | null };
  return data.result;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("KV not configured");
  // POST body form avoids URL-length limits for large values.
  const res = await fetch(`${c.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "text/plain" },
    body: value,
  });
  if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
}
