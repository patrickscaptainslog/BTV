import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST() {
  revalidateTag("appfolio");
  return NextResponse.json({ ok: true, revalidated_at: new Date().toISOString() });
}
