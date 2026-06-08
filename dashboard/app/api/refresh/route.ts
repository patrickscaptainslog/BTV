import { clearCache } from "@/lib/appfolio";
import { NextResponse } from "next/server";

export async function POST() {
  clearCache();
  return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() });
}
