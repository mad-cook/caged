import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getTokenLocksCached } from "@/lib/server/locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "public, max-age=15, s-maxage=15",
};

/**
 * GET /api/locks/<mint>
 * Everything locked for one token: totals, % of supply, boost pool, every lock.
 * Public, CORS-open, cached ~20s server-side. Meant for terminals/bots.
 */
export async function GET(_req: NextRequest, { params }: { params: { mint: string } }) {
  let mint: PublicKey;
  try {
    mint = new PublicKey(params.mint);
  } catch {
    return NextResponse.json({ error: "invalid mint address" }, { status: 400, headers: CORS });
  }
  try {
    const data = await getTokenLocksCached(mint);
    return NextResponse.json(data, { headers: CORS });
  } catch (e: any) {
    console.error("/api/locks failed", e);
    return NextResponse.json({ error: e?.message || "rpc error" }, { status: 502, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
