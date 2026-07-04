import "server-only";
import { cookies } from "next/headers";

export function sessionToken(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  const password = process.env.APP_PASSWORD ?? "";
  return Buffer.from(`${secret}:${password}`).toString("base64").slice(0, 40);
}

/**
 * AI routes are open when no APP_PASSWORD is configured (local dev),
 * and cookie-gated when one is (deployed), so the API key can't be farmed
 * by anyone who finds the URL.
 */
export function isAuthorized(): boolean {
  if (!process.env.APP_PASSWORD) return true;
  return cookies().get("cset_session")?.value === sessionToken();
}
