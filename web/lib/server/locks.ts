/**
 * Server-side reads of the holder_locker program. Used by /api/locks/* and the
 * token page. Runs on Node (route handlers), never in the browser.
 */
import { BorshAccountsCoder, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "@/idl/holder_locker.json";
import { PROGRAM_ID } from "@/lib/constants";
import { getPumpStatuses, PumpStatus } from "@/lib/pump";
import { formatUnits } from "@/lib/format";
import { resolveTokenMeta } from "@/lib/server/meta";

const RPC_URL =
  process.env.RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  (process.env.NEXT_PUBLIC_CLUSTER === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com");


let _conn: Connection | null = null;
export function serverConnection(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, "confirmed");
  return _conn;
}

const coder = new BorshAccountsCoder(idl as Idl);
const LOCK_DISC = Buffer.from((idl as any).accounts.find((a: any) => a.name === "Lock").discriminator);
// Lock layout: 8 disc | owner 32 | mint 32 | ...
const LOCK_MINT_OFFSET = 8 + 32;
const LOCK_OWNER_OFFSET = 8;

export interface LockJson {
  address: string;
  owner: string;
  mint: string;
  vaultAuthority: string;
  amountRaw: string;
  amount: string;
  unlockTs: number;
  createdTs: number;
  withdrawn: boolean;
  boostedAmountRaw: string;
  bonusBps: number;
  solRewardsClaimedLamports: string;
  bonusPaidLamports: string;
}

export interface TokenLocksJson {
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  decimals: number;
  supplyRaw: string | null;
  pump: PumpStatus | null;
  /** asset holder rewards are paid in; null = SOL */
  rewardAsset: { mint: string; symbol: string | null; name: string | null; image: string | null } | null;
  totalLockedRaw: string;
  totalLocked: string;
  percentOfSupply: number | null;
  lockCount: number;
  activeLockCount: number;
  uniqueLockers: number;
  totalSolRewardsClaimedLamports: string;
  nextUnlockTs: number | null;
  boostPool: {
    address: string;
    capacityRaw: string;
    enrolledRaw: string;
    minDurationSeconds: number;
    bonusBps: number;
    active: boolean;
    /** SOL pool: lamports on the account. Token pool: raw balance of the pool token account. */
    balanceLamports: number;
    totalBonusPaidLamports: string;
    /** null = pays SOL */
    rewardMint: string | null;
    rewardSymbol: string | null;
    rewardDecimals: number | null;
    balanceRaw: string;
  } | null;
  locks: LockJson[];
  updatedAt: number;
}

function decodeLock(pubkey: PublicKey, data: Buffer): LockJson & { decimalsHint?: number } {
  // NB: the raw coder keeps the IDL snake_case field names.
  const l = coder.decode("Lock", data);
  return {
    address: pubkey.toBase58(),
    owner: l.owner.toBase58(),
    mint: l.mint.toBase58(),
    vaultAuthority: l.vault_authority.toBase58(),
    amountRaw: l.amount.toString(),
    amount: "", // filled once decimals are known
    unlockTs: l.unlock_ts.toNumber(),
    createdTs: l.created_ts.toNumber(),
    withdrawn: l.withdrawn,
    boostedAmountRaw: l.boosted_amount.toString(),
    bonusBps: l.bonus_bps,
    solRewardsClaimedLamports: l.sol_rewards_claimed.toString(),
    bonusPaidLamports: l.bonus_paid.toString(),
  };
}

export async function fetchLocksForMint(mint: PublicKey): Promise<LockJson[]> {
  const conn = serverConnection();
  const accs = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(LOCK_DISC) } },
      { memcmp: { offset: LOCK_MINT_OFFSET, bytes: mint.toBase58() } },
    ],
  });
  return accs.map((a) => decodeLock(a.pubkey, Buffer.from(a.account.data)));
}

export async function fetchLocksForOwner(owner: PublicKey): Promise<LockJson[]> {
  const conn = serverConnection();
  const accs = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(LOCK_DISC) } },
      { memcmp: { offset: LOCK_OWNER_OFFSET, bytes: owner.toBase58() } },
    ],
  });
  return accs.map((a) => decodeLock(a.pubkey, Buffer.from(a.account.data)));
}

async function fetchMeta(mint: string): Promise<{ name: string | null; symbol: string | null; image: string | null; decimals: number | null }> {
  const m = (await resolveTokenMeta([mint])).get(mint);
  if (!m) return { name: null, symbol: null, image: null, decimals: null };
  return { name: m.name, symbol: m.symbol, image: m.image, decimals: m.decimals };
}

export async function buildTokenLocks(mint: PublicKey): Promise<TokenLocksJson> {
  const conn = serverConnection();
  const boostPda = PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], PROGRAM_ID)[0];

  const [locks, supply, meta, pumpMap, boostInfo] = await Promise.all([
    fetchLocksForMint(mint),
    conn.getTokenSupply(mint, "confirmed").catch(() => null),
    fetchMeta(mint.toBase58()),
    getPumpStatuses(conn, [mint]).catch(() => new Map<string, PumpStatus>()),
    conn.getAccountInfo(boostPda, "confirmed").catch(() => null),
  ]);

  const decimals = supply?.value.decimals ?? meta.decimals ?? 6;
  let total = 0n;
  let active = 0;
  let rewards = 0n;
  let nextUnlock: number | null = null;
  const owners = new Set<string>();
  for (const l of locks) {
    l.amount = formatUnits(l.amountRaw, decimals, 2);
    if (!l.withdrawn) {
      total += BigInt(l.amountRaw);
      active++;
      owners.add(l.owner);
      if (nextUnlock === null || l.unlockTs < nextUnlock) nextUnlock = l.unlockTs;
    }
    rewards += BigInt(l.solRewardsClaimedLamports);
  }
  locks.sort((a, b) => (a.withdrawn === b.withdrawn ? Number(BigInt(b.amountRaw) - BigInt(a.amountRaw) > 0n ? 1 : -1) : a.withdrawn ? 1 : -1));

  const supplyRaw = supply ? BigInt(supply.value.amount) : null;
  const pct = supplyRaw && supplyRaw > 0n ? Number((total * 1_000_000n) / supplyRaw) / 10_000 : null;

  let boostPool: TokenLocksJson["boostPool"] = null;
  if (boostInfo) {
    try {
      const p = coder.decode("BoostPool", Buffer.from(boostInfo.data));
      boostPool = {
        address: boostPda.toBase58(),
        capacityRaw: p.capacity.toString(),
        enrolledRaw: p.enrolled.toString(),
        minDurationSeconds: p.min_duration.toNumber(),
        bonusBps: p.bonus_bps,
        active: p.active,
        balanceLamports: boostInfo.lamports,
        totalBonusPaidLamports: p.total_bonus_paid.toString(),
        rewardMint: null,
        rewardSymbol: null,
        rewardDecimals: null,
        balanceRaw: String(boostInfo.lamports),
      };
      const rm: PublicKey = p.reward_mint;
      if (!rm.equals(PublicKey.default)) {
        const tp: PublicKey = p.reward_token_program;
        const poolAta = getAssociatedTokenAddressSync(rm, boostPda, true, tp);
        const [bal, qm] = await Promise.all([
          conn.getTokenAccountBalance(poolAta, "confirmed").catch(() => null),
          fetchMeta(rm.toBase58()),
        ]);
        boostPool.rewardMint = rm.toBase58();
        boostPool.rewardSymbol = qm.symbol;
        boostPool.rewardDecimals = bal?.value.decimals ?? qm.decimals;
        boostPool.balanceRaw = bal?.value.amount ?? "0";
      }
    } catch {
      boostPool = null;
    }
  }

  const pump = pumpMap.get(mint.toBase58()) ?? null;
  let rewardAsset: TokenLocksJson["rewardAsset"] = null;
  if (pump?.quoteMint) {
    const q = await fetchMeta(pump.quoteMint);
    rewardAsset = { mint: pump.quoteMint, symbol: q.symbol, name: q.name, image: q.image };
  }

  return {
    mint: mint.toBase58(),
    name: meta.name,
    symbol: meta.symbol,
    image: meta.image,
    decimals,
    supplyRaw: supplyRaw?.toString() ?? null,
    pump,
    rewardAsset,
    totalLockedRaw: total.toString(),
    totalLocked: formatUnits(total, decimals, 2),
    percentOfSupply: pct,
    lockCount: locks.length,
    activeLockCount: active,
    uniqueLockers: owners.size,
    totalSolRewardsClaimedLamports: rewards.toString(),
    nextUnlockTs: nextUnlock,
    boostPool,
    locks,
    updatedAt: Date.now(),
  };
}

// Small TTL cache so terminals hammering the endpoint do not hammer the RPC.
const cache = new Map<string, { at: number; v: TokenLocksJson }>();
const TTL_MS = 20_000;

export async function getTokenLocksCached(mint: PublicKey): Promise<TokenLocksJson> {
  const key = mint.toBase58();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const v = await buildTokenLocks(mint);
  cache.set(key, { at: Date.now(), v });
  return v;
}
