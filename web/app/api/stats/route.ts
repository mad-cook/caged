import { NextResponse } from "next/server";
import { BorshAccountsCoder, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/holder_locker.json";
import { PROGRAM_ID } from "@/lib/constants";
import { serverConnection } from "@/lib/server/locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "public, max-age=30, s-maxage=30",
};

const coder = new BorshAccountsCoder(idl as Idl);

/** GET /api/stats — protocol-wide counters from the on-chain config. */
export async function GET() {
  try {
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
    const info = await serverConnection().getAccountInfo(configPda, "confirmed");
    if (!info) return NextResponse.json({ error: "program not initialized" }, { status: 404, headers: CORS });
    const c = coder.decode("Config", Buffer.from(info.data));
    return NextResponse.json(
      {
        programId: PROGRAM_ID.toBase58(),
        cluster: process.env.NEXT_PUBLIC_CLUSTER || "mainnet-beta",
        treasury: c.treasury.toBase58(),
        lockFeeLamports: c.lockFeeLamports.toString(),
        rewardFeeBps: c.rewardFeeBps,
        paused: c.paused,
        totalLocks: c.totalLocks.toString(),
        totalLockFeesLamports: c.totalLockFees.toString(),
        totalRewardFeesLamports: c.totalRewardFees.toString(),
        totalRewardsPaidLamports: c.totalRewardsPaid.toString(),
        updatedAt: Date.now(),
      },
      { headers: CORS },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "rpc error" }, { status: 502, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
