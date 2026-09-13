import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { coSign, custodyEnabled } from "@/lib/server/custody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// crude per-IP throttle; the program enforces all real rules
const hits = new Map<string, { n: number; at: number }>();
const LIMIT = 30;
const WINDOW = 60_000;

/** POST /api/custody/sign { lock, tx } -> { tx } : co-sign with the lock's holder key. */
export async function POST(req: NextRequest) {
  if (!custodyEnabled()) return NextResponse.json({ error: "custody disabled" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.at < WINDOW) {
    if (++h.n > LIMIT) return NextResponse.json({ error: "slow down" }, { status: 429 });
  } else hits.set(ip, { n: 1, at: now });

  let lock: PublicKey;
  let tx: string;
  try {
    const body = await req.json();
    lock = new PublicKey(body.lock);
    tx = String(body.tx);
    if (tx.length > 4000) throw new Error("tx too large");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    return NextResponse.json(coSign(lock, tx));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "refused" }, { status: 400 });
  }
}
