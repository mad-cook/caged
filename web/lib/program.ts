/**
 * Thin client over the holder_locker Anchor program.
 */
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "@/idl/holder_locker.json";
import type { HolderLocker } from "@/idl/holder_locker";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, VAULT_RESERVE_LAMPORTS } from "./constants";

export type LockAccount = {
  publicKey: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  vaultAuthority: PublicKey;
  lockId: BN;
  amount: BN;
  unlockTs: BN;
  createdTs: BN;
  withdrawn: boolean;
  solRewardsClaimed: BN;
  boostedAmount: BN;
  bonusBps: number;
  bonusPaid: BN;
  bump: number;
  vaultBump: number;
};

export type ConfigAccount = {
  admin: PublicKey;
  treasury: PublicKey;
  lockFeeLamports: BN;
  rewardFeeBps: number;
  paused: boolean;
  totalLocks: BN;
  totalLockFees: BN;
  totalRewardFees: BN;
  totalRewardsPaid: BN;
};

export type BoostPoolAccount = {
  publicKey: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  capacity: BN;
  enrolled: BN;
  minDuration: BN;
  bonusBps: number;
  totalBonusPaid: BN;
  active: boolean;
  lamports: number;
};

/** Minimal wallet shape AnchorProvider needs (wallet-adapter's AnchorWallet satisfies it). */
export interface WalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/** A read-only wallet so we can build a Program without a connected wallet. */
const readonlyWallet: WalletLike = {
  publicKey: PublicKey.default,
  async signTransaction() {
    throw new Error("Connect a wallet first");
  },
  async signAllTransactions() {
    throw new Error("Connect a wallet first");
  },
};

export function getProgram(connection: Connection, wallet?: WalletLike): Program<HolderLocker> {
  const provider = new AnchorProvider(connection, (wallet ?? readonlyWallet) as unknown as Wallet, {
    commitment: "confirmed",
  });
  const idlWithAddress = { ...idl, address: PROGRAM_ID.toBase58() } as unknown as HolderLocker;
  return new Program<HolderLocker>(idlWithAddress, provider);
}

// ----------------------------------------------------------------- PDAs ----

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
}
export function lockPda(owner: PublicKey, lockId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lock"), owner.toBuffer(), lockId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];
}
export function vaultAuthorityPda(lock: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), lock.toBuffer()], PROGRAM_ID)[0];
}
export function boostPoolPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], PROGRAM_ID)[0];
}
export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
}

// --------------------------------------------------------------- reads ----

export async function fetchConfig(program: Program<HolderLocker>): Promise<ConfigAccount | null> {
  const c = await program.account.config.fetchNullable(configPda());
  return c as unknown as ConfigAccount | null;
}

export async function fetchLocksByOwner(program: Program<HolderLocker>, owner: PublicKey): Promise<LockAccount[]> {
  const rows = await program.account.lock.all([{ memcmp: { offset: 8, bytes: owner.toBase58() } }]);
  return rows
    .map((r) => ({ publicKey: r.publicKey, ...(r.account as unknown as Omit<LockAccount, "publicKey">) }))
    .sort((a, b) => b.createdTs.cmp(a.createdTs));
}

export async function fetchLock(program: Program<HolderLocker>, address: PublicKey): Promise<LockAccount | null> {
  const acc = await program.account.lock.fetchNullable(address);
  if (!acc) return null;
  return { publicKey: address, ...(acc as unknown as Omit<LockAccount, "publicKey">) };
}

export async function fetchBoostPool(program: Program<HolderLocker>, mint: PublicKey): Promise<BoostPoolAccount | null> {
  const pk = boostPoolPda(mint);
  const info = await program.provider.connection.getAccountInfo(pk, "confirmed");
  if (!info) return null;
  const acc = program.coder.accounts.decode("BoostPool", info.data);
  return { publicKey: pk, lamports: info.lamports, ...(acc as unknown as Omit<BoostPoolAccount, "publicKey" | "lamports">) };
}

let reservePromise: Promise<number> | null = null;
/** Rent-exempt minimum for a 0-byte account (differs per cluster; the program reads it on-chain). */
export function fetchVaultReserve(connection: Connection): Promise<number> {
  if (!reservePromise) {
    reservePromise = connection
      .getMinimumBalanceForRentExemption(0, "confirmed")
      .catch(() => VAULT_RESERVE_LAMPORTS);
  }
  return reservePromise;
}

/** Lamports the owner can claim right now from a lock's vault authority. */
export async function fetchClaimableSol(connection: Connection, vaultAuthority: PublicKey): Promise<number> {
  const [bal, reserve] = await Promise.all([
    connection.getBalance(vaultAuthority, "confirmed"),
    fetchVaultReserve(connection),
  ]);
  return Math.max(0, bal - reserve);
}

export interface TokenReward {
  mint: PublicKey;
  tokenProgram: PublicKey;
  account: PublicKey;
  rawAmount: bigint;
  decimals: number;
}

/** Any SPL / Token-2022 balances sitting on the vault authority except the locked mint. */
export async function fetchTokenRewards(
  connection: Connection,
  vaultAuthority: PublicKey,
  lockedMint: PublicKey,
): Promise<TokenReward[]> {
  const out: TokenReward[] = [];
  for (const prog of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await connection.getParsedTokenAccountsByOwner(vaultAuthority, { programId: prog }, "confirmed");
    for (const acc of res.value) {
      const info = acc.account.data.parsed.info;
      const mint = new PublicKey(info.mint);
      if (mint.equals(lockedMint)) continue;
      const raw = BigInt(info.tokenAmount.amount);
      if (raw === 0n) continue;
      out.push({ mint, tokenProgram: prog, account: acc.pubkey, rawAmount: raw, decimals: info.tokenAmount.decimals });
    }
  }
  return out;
}

// ------------------------------------------------------ instructions ----

export interface CreateLockParams {
  owner: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: BN;
  unlockTs: number;
  treasury: PublicKey;
  /** pass when the mint has a boost pool */
  boostPool?: PublicKey | null;
  lockId?: BN;
}

export async function createLockIx(program: Program<HolderLocker>, p: CreateLockParams) {
  const lockId = p.lockId ?? new BN(Date.now());
  const lock = lockPda(p.owner, lockId);
  const vaultAuthority = vaultAuthorityPda(lock);
  const ix = await program.methods
    .createLock(lockId, p.amount, new BN(p.unlockTs))
    .accountsPartial({
      config: configPda(),
      treasury: p.treasury,
      owner: p.owner,
      mint: p.mint,
      ownerTokenAccount: ata(p.owner, p.mint, p.tokenProgram),
      lock,
      vaultAuthority,
      vault: ata(vaultAuthority, p.mint, p.tokenProgram),
      boostPool: p.boostPool ?? null,
      tokenProgram: p.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { ix, lock, lockId, vaultAuthority };
}

export async function topUpIx(program: Program<HolderLocker>, l: LockAccount, amount: BN, boostPool?: PublicKey | null) {
  return program.methods
    .topUp(amount)
    .accountsPartial({
      owner: l.owner,
      lock: l.publicKey,
      mint: l.mint,
      ownerTokenAccount: ata(l.owner, l.mint, l.tokenProgram),
      vaultAuthority: l.vaultAuthority,
      vault: ata(l.vaultAuthority, l.mint, l.tokenProgram),
      boostPool: boostPool ?? null,
      tokenProgram: l.tokenProgram,
    })
    .instruction();
}

export async function extendLockIx(program: Program<HolderLocker>, l: LockAccount, newUnlockTs: number) {
  return program.methods
    .extendLock(new BN(newUnlockTs))
    .accountsPartial({ owner: l.owner, lock: l.publicKey })
    .instruction();
}

export async function withdrawIx(program: Program<HolderLocker>, l: LockAccount, boostPool?: PublicKey | null) {
  return program.methods
    .withdraw()
    .accountsPartial({
      owner: l.owner,
      lock: l.publicKey,
      mint: l.mint,
      ownerTokenAccount: ata(l.owner, l.mint, l.tokenProgram),
      vaultAuthority: l.vaultAuthority,
      vault: ata(l.vaultAuthority, l.mint, l.tokenProgram),
      boostPool: boostPool ?? null,
      tokenProgram: l.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function claimSolRewardsIx(
  program: Program<HolderLocker>,
  l: LockAccount,
  treasury: PublicKey,
  boostPool?: PublicKey | null,
) {
  return program.methods
    .claimSolRewards()
    .accountsPartial({
      config: configPda(),
      treasury,
      owner: l.owner,
      lock: l.publicKey,
      vaultAuthority: l.vaultAuthority,
      boostPool: boostPool ?? null,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function claimTokenRewardsIx(
  program: Program<HolderLocker>,
  l: LockAccount,
  treasury: PublicKey,
  reward: TokenReward,
) {
  return program.methods
    .claimTokenRewards()
    .accountsPartial({
      config: configPda(),
      treasury,
      owner: l.owner,
      lock: l.publicKey,
      vaultAuthority: l.vaultAuthority,
      rewardMint: reward.mint,
      rewardVault: ata(l.vaultAuthority, reward.mint, reward.tokenProgram),
      ownerTokenAccount: ata(l.owner, reward.mint, reward.tokenProgram),
      treasuryTokenAccount: ata(treasury, reward.mint, reward.tokenProgram),
      rewardTokenProgram: reward.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function closeLockIx(program: Program<HolderLocker>, l: LockAccount, treasury: PublicKey) {
  return program.methods
    .closeLock()
    .accountsPartial({
      config: configPda(),
      treasury,
      owner: l.owner,
      lock: l.publicKey,
      vaultAuthority: l.vaultAuthority,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

// --------------------------------------------------------------- send ----

export function buildTx(payer: PublicKey, ixs: TransactionInstruction[], priorityMicroLamports = 50_000): Transaction {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }));
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = payer;
  return tx;
}

/** Turn Anchor / wallet errors into something a human can read. */
export function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/Error Message: ([^.]+)\.?/);
  if (m) return m[1];
  if (/User rejected/i.test(msg)) return "Transaction rejected in wallet";
  if (/insufficient lamports|0x1\b/.test(msg)) return "Not enough SOL to pay fees";
  if (/TokenAccountNotFound|could not find account/i.test(msg)) return "Token account not found";
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}
