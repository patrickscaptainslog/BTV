import { NextResponse } from "next/server";
import { sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json()) as { password?: string };

  if (!process.env.APP_PASSWORD || !body.password || body.password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("cset_session", sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
