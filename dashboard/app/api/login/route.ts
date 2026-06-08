import { NextResponse } from "next/server";

function sessionToken(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  return Buffer.from(`${secret}:${password}`).toString("base64").slice(0, 40);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { password } = body as { password?: string };

  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
