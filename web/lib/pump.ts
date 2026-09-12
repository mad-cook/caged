/**
 * Read-only helpers for detecting whether a mint is a pump.fun
 * "Holder Rewards" coin, by inspecting the BondingCurve (pre-graduation)
 * and the canonical PumpSwap Pool (post-graduation).
 *
 * Layouts come from pump-fun/pump-public-docs idl/pump.json + pump_amm.json.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID, WSOL_MINT } from "./constants";

// BondingCurve: 8 disc | 5×u64 (40) | complete u8 | creator 32 | mayhem u8 |
// cashback u8 | quote_mint 32 | creator_fee_bps u64 | can_edit u8 | is_holder_reward u8
const BC_COMPLETE_OFFSET = 8 + 40;
const BC_CASHBACK_OFFSET = 8 + 40 + 1 + 32 + 1;
const BC_QUOTE_MINT_OFFSET = BC_CASHBACK_OFFSET + 1;
const BC_HOLDER_REWARD_OFFSET = BC_QUOTE_MINT_OFFSET + 32 + 8 + 1; // 124
const BC_DISC = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);

// Pool: 8 disc | bump u8 | index u16 | creator 32 | base 32 | quote 32 | lp 32 |
// pool_base 32 | pool_quote 32 | lp_supply u64 | coin_creator 32 | mayhem u8 |
// cashback u8 | virtual_quote i128 | creator_fee_bps u64 | can_edit u8 | is_holder_reward u8
const POOL_QUOTE_MINT_OFFSET = 8 + 1 + 2 + 32 + 32;
const POOL_HOLDER_REWARD_OFFSET = 8 + 1 + 2 + 32 * 6 + 8 + 32 + 1 + 1 + 16 + 8 + 1; // 270
const POOL_DISC = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

export interface PumpStatus {
  /** true if the mint is a pump.fun coin at all (bonding curve exists) */
  isPump: boolean;
  /** true if the creator fee is redirected to holders */
  isHolderReward: boolean;
  /** true if the curve completed and trading moved to PumpSwap */
  graduated: boolean;
  /** quote asset; null for SOL */
  quoteMint: string | null;
  bondingCurve: string;
  pool: string | null;
}

export function bondingCurvePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  )[0];
}

export function pumpPoolAuthorityPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  )[0];
}

export function canonicalPoolPda(mint: PublicKey, quoteMint: PublicKey = WSOL_MINT): PublicKey {
  const index = Buffer.alloc(2);
  index.writeUInt16LE(0);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      index,
      pumpPoolAuthorityPda(mint).toBuffer(),
      mint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    PUMP_AMM_PROGRAM_ID,
  )[0];
}

function parseBondingCurve(data: Buffer) {
  if (data.length < 8 || !data.subarray(0, 8).equals(BC_DISC)) return null;
  const complete = data[BC_COMPLETE_OFFSET] === 1;
  const quoteMint =
    data.length >= BC_QUOTE_MINT_OFFSET + 32
      ? new PublicKey(data.subarray(BC_QUOTE_MINT_OFFSET, BC_QUOTE_MINT_OFFSET + 32))
      : WSOL_MINT;
  const isHolderReward = data.length > BC_HOLDER_REWARD_OFFSET && data[BC_HOLDER_REWARD_OFFSET] === 1;
  return { complete, quoteMint, isHolderReward };
}

function parsePool(data: Buffer) {
  if (data.length < 8 || !data.subarray(0, 8).equals(POOL_DISC)) return null;
  const quoteMint = new PublicKey(data.subarray(POOL_QUOTE_MINT_OFFSET, POOL_QUOTE_MINT_OFFSET + 32));
  const isHolderReward = data.length > POOL_HOLDER_REWARD_OFFSET && data[POOL_HOLDER_REWARD_OFFSET] === 1;
  return { quoteMint, isHolderReward };
}

/** Batch-detect pump status for many mints (2 RPC round trips). */
export async function getPumpStatuses(
  connection: Connection,
  mints: PublicKey[],
): Promise<Map<string, PumpStatus>> {
  const out = new Map<string, PumpStatus>();
  if (mints.length === 0) return out;

  const curves = mints.map(bondingCurvePda);
  const curveInfos = await getMultiple(connection, curves);

  const poolLookups: { mint: PublicKey; pool: PublicKey; idx: number }[] = [];
  mints.forEach((mint, i) => {
    const info = curveInfos[i];
    const parsed = info ? parseBondingCurve(info) : null;
    if (!parsed) {
      out.set(mint.toBase58(), {
        isPump: false,
        isHolderReward: false,
        graduated: false,
        quoteMint: null,
        bondingCurve: curves[i].toBase58(),
        pool: null,
      });
      return;
    }
    const isSol = parsed.quoteMint.equals(WSOL_MINT) || parsed.quoteMint.equals(PublicKey.default);
    const quote = isSol ? WSOL_MINT : parsed.quoteMint;
    const pool = canonicalPoolPda(mint, quote);
    out.set(mint.toBase58(), {
      isPump: true,
      isHolderReward: parsed.isHolderReward,
      graduated: parsed.complete,
      quoteMint: isSol ? null : quote.toBase58(),
      bondingCurve: curves[i].toBase58(),
      pool: pool.toBase58(),
    });
    if (parsed.complete) poolLookups.push({ mint, pool, idx: i });
  });

  if (poolLookups.length) {
    const poolInfos = await getMultiple(
      connection,
      poolLookups.map((p) => p.pool),
    );
    poolLookups.forEach((p, j) => {
      const info = poolInfos[j];
      const parsed = info ? parsePool(info) : null;
      if (!parsed) return;
      const cur = out.get(p.mint.toBase58())!;
      // Post-graduation the pool flag is authoritative.
      cur.isHolderReward = parsed.isHolderReward || cur.isHolderReward;
    });
  }
  return out;
}

async function getMultiple(connection: Connection, keys: PublicKey[]): Promise<(Buffer | null)[]> {
  const res: (Buffer | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk, "confirmed");
    for (const info of infos) res.push(info ? Buffer.from(info.data) : null);
  }
  return res;
}
