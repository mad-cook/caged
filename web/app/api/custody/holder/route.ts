import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { custodyEnabled, deriveAuthority, deriveHolder } from "@/lib/server/custody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/custody/holder { lock } -> { holder } : the on-curve holder address for a lock. */
export async function POST(req: NextRequest) {
  if (!custodyEnabled()) return NextResponse.json({ error: "custody disabled" }, { status: 503 });
  let lock: PublicKey;
  try {
    const body = await req.json();
    lock = new PublicKey(body.lock);
  } catch {
    return NextResponse.json({ error: "bad lock" }, { status: 400 });
  }
  return NextResponse.json({ holder: deriveHolder(lock).publicKey.toBase58(), authority: deriveAuthority().publicKey.toBase58() });
}
