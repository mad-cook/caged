/**
 * stonk.fun detection (isomorphic).
 *
 * stonk.fun coins are Token-2022 mints with a permanent transfer fee whose
 * withheld-fee authority is stonk.fun's rewards distributor. Newer launches
 * live on Raydium LaunchLab: the PoolState (429 bytes) holds base_mint at
 * offset 205, quote_mint at 237 and the platform config at 173. Rewards are
 * paid by the distributor wallet in the quote asset, to on-curve owners only
 * (same rule as pump.fun, verified on-chain 2026-09-14).
 */
import { Connection, PublicKey } from "@solana/web3.js";

export const STONK_DISTRIBUTOR = new PublicKey("5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD");
export const LAUNCHLAB_PROGRAM_ID = new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
export const STONK_REWARD_CONFIG = new PublicKey("6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt");
export const STONK_STANDARD_CONFIG = new PublicKey("4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7");

const POOL_SIZE = 429;
const POOL_CFG_OFFSET = 173;
const POOL_BASE_OFFSET = 205;
const POOL_QUOTE_OFFSET = 237;

export interface StonkStatus {
  isStonk: boolean;
  /** permanent transfer tax on every transfer, in bps (funds the rewards) */
  feeBps: number;
  /** asset rewards are paid in; null if the coin's pool could not be found */
  quoteMint: string | null;
  /** launched under stonk.fun's "reward" platform config */
  rewardLaunch: boolean;
  pool: string | null;
}

/** Cheap fingerprint from a parsed mint account (no extra RPC). */
export function stonkFingerprint(parsedMintInfo: any): { isStonk: boolean; feeBps: number } {
  const exts: any[] = parsedMintInfo?.extensions || [];
  const fee = exts.find((e) => e.extension === "transferFeeConfig");
  if (!fee) return { isStonk: false, feeBps: 0 };
  const auth = fee.state?.withdrawWithheldAuthority;
  const bps = Number(fee.state?.newerTransferFee?.transferFeeBasisPoints ?? 0);
  return { isStonk: auth === STONK_DISTRIBUTOR.toBase58(), feeBps: bps };
}

async function findLaunchLabPool(connection: Connection, mint: PublicKey): Promise<{ pool: string; quoteMint: string; rewardLaunch: boolean } | null> {
  const accs = await connection.getProgramAccounts(LAUNCHLAB_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: POOL_SIZE }, { memcmp: { offset: POOL_BASE_OFFSET, bytes: mint.toBase58() } }],
  });
  if (!accs.length) return null;
  const d = Buffer.from(accs[0].account.data);
  return {
    pool: accs[0].pubkey.toBase58(),
    quoteMint: new PublicKey(d.subarray(POOL_QUOTE_OFFSET, POOL_QUOTE_OFFSET + 32)).toBase58(),
    rewardLaunch: new PublicKey(d.subarray(POOL_CFG_OFFSET, POOL_CFG_OFFSET + 32)).equals(STONK_REWARD_CONFIG),
  };
}

/** Batch-detect stonk.fun status. One RPC for the mints, plus one per stonk.fun coin for its pool. */
export async function getStonkStatuses(connection: Connection, mints: PublicKey[]): Promise<Map<string, StonkStatus>> {
  const out = new Map<string, StonkStatus>();
  if (!mints.length) return out;
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await connection.getMultipleParsedAccounts(chunk, { commitment: "confirmed" });
    await Promise.all(
      chunk.map(async (mint, j) => {
        const v = infos.value[j];
        const parsed = v && "parsed" in v.data ? (v.data as any).parsed?.info : null;
        const fp = stonkFingerprint(parsed);
        if (!fp.isStonk) {
          out.set(mint.toBase58(), { isStonk: false, feeBps: fp.feeBps, quoteMint: null, rewardLaunch: false, pool: null });
          return;
        }
        const pool = await findLaunchLabPool(connection, mint).catch(() => null);
        out.set(mint.toBase58(), {
          isStonk: true,
          feeBps: fp.feeBps,
          quoteMint: pool?.quoteMint ?? null,
          rewardLaunch: pool?.rewardLaunch ?? true,
          pool: pool?.pool ?? null,
        });
      }),
    );
  }
  return out;
}
