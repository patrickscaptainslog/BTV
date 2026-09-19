import { NextResponse } from "next/server";

// Credential diagnostic for AppFolio 401s. Password-gated by middleware.
// Never returns secret VALUES — only shape (length, stray whitespace/quotes)
// plus the live HTTP status AppFolio answers with.
export const dynamic = "force-dynamic";

function describe(name: string, reveal = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return { set: false };
  const trimmed = raw.trim();
  return {
    set: true,
    length: raw.length,
    surrounding_whitespace: raw !== trimmed,
    contains_newline: /[\r\n]/.test(raw),
    wrapped_in_quotes: /^["']|["']$/.test(trimmed),
    ...(reveal ? { value: trimmed } : {}),
  };
}

async function probe(db: string, id: string, secret: string) {
  if (!db || !id || !secret) return { skipped: "one or more env vars missing" };
  try {
    const res = await fetch(`https://${db}.appfolio.com/api/v2/reports/rent_roll.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ paginate_results: true }),
      cache: "no-store",
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 160) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const db = (process.env.APPFOLIO_DATABASE ?? "").trim();
  const id = process.env.APPFOLIO_CLIENT_ID ?? "";
  const secret = process.env.APPFOLIO_CLIENT_SECRET ?? "";

  // Probe exactly as stored; if trimming would change them, probe again trimmed.
  // A trimmed probe that succeeds means the Vercel value has stray whitespace.
  const as_stored = await probe(db, id, secret);
  const differs = id !== id.trim() || secret !== secret.trim();
  const as_trimmed = differs
    ? await probe(db, id.trim(), secret.trim())
    : { skipped: "identical to as_stored (no stray whitespace)" };

  return NextResponse.json({
    env: {
      APPFOLIO_DATABASE: describe("APPFOLIO_DATABASE", true),
      APPFOLIO_CLIENT_ID: describe("APPFOLIO_CLIENT_ID"),
      APPFOLIO_CLIENT_SECRET: describe("APPFOLIO_CLIENT_SECRET"),
    },
    as_stored,
    as_trimmed,
    how_to_read: [
      "as_stored.status 200 -> credentials are fine; the error was transient.",
      "as_trimmed.status 200 -> stray whitespace/newline in the Vercel value; re-paste it.",
      "both 401 -> AppFolio rejected the key: regenerate API credentials in AppFolio, update Vercel, redeploy.",
      "404 or DNS error -> APPFOLIO_DATABASE subdomain is wrong.",
    ],
  });
}
