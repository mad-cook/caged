import { NextRequest, NextResponse } from "next/server";
import { resolveTokenMeta } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** POST /api/token { mints: string[] } -> { tokens: TokenMeta[] } */
export async function POST(req: NextRequest) {
  let mints: string[] = [];
  try {
    const body = await req.json();
    mints = Array.isArray(body?.mints) ? body.mints : [];
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  mints = Array.from(new Set(mints.filter((m) => typeof m === "string" && BASE58.test(m)))).slice(0, 200);
  const metas = await resolveTokenMeta(mints);
  return NextResponse.json({ tokens: Array.from(metas.values()) });
}
