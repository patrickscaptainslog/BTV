import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/login", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;
  const valid = session === signedToken();

  if (!valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function signedToken(): string {
  // Simple HMAC-less token: hash of secret + salt
  // For a stronger auth, swap this for jose / iron-session.
  const secret = process.env.SESSION_SECRET ?? "";
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  return Buffer.from(`${secret}:${password}`).toString("base64").slice(0, 40);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
