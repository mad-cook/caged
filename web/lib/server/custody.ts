/**
 * Custodial holder keys (server only).
 *
 * Each custodial lock's vault is owned by an ordinary on-curve keypair so that
 * pump.fun's holder-reward distributor treats it as a wallet. The keypair is
 * derived deterministically from one master secret and the lock address:
 *
 *   seed = HMAC-SHA512(LOCK_MASTER_SECRET, "caged-holder-v1" || lock_pubkey)[0..32]
 *
 * No database, no key storage: the same lock always maps to the same key. The
 * master secret must never leave the server environment.
 *
 * The co-signer only signs transactions made of our program's instructions
 * (plus compute-budget), in which the holder key appears exactly where the
 * program expects it. The program enforces ownership, unlock time and fee
 * split, so even an attacker with API access can only do what a legitimate
 * lock owner could.
 */
import { createHmac } from "crypto";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/constants";

const MASTER = process.env.LOCK_MASTER_SECRET || "";

export function custodyEnabled(): boolean {
  return MASTER.length >= 32;
}

export function deriveHolder(lock: PublicKey): Keypair {
  if (!custodyEnabled()) throw new Error("custody not configured (LOCK_MASTER_SECRET)");
  const seed = createHmac("sha512", Buffer.from(MASTER, "utf8"))
    .update(Buffer.from("caged-holder-v1"))
    .update(lock.toBuffer())
    .digest()
    .subarray(0, 32);
  return Keypair.fromSeed(seed);
}

/** Anchor instruction discriminators (first 8 bytes) that the holder may co-sign. */
const ALLOWED_IX_NAMES = new Set([
  "create_lock_custodial",
  "migrate_lock_to_custodial",
  "withdraw_custodial",
  "claim_sol_rewards_custodial",
  "claim_token_rewards_custodial",
  "close_lock_custodial",
]);

let discs: Map<string, string> | null = null;
function discriminators(): Map<string, string> {
  if (!discs) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require("@/idl/holder_locker.json");
    discs = new Map(idl.instructions.map((i: any) => [Buffer.from(i.discriminator).toString("hex"), i.name]));
  }
  return discs;
}

export interface CoSignResult {
  ok: true;
  tx: string; // base64, now carrying the holder signature
  holder: string;
}

/**
 * Validate and co-sign a transaction for `lock`. Rejects anything that is not
 * an allowed instruction of our program, and never signs with a key other than
 * the one derived for that lock.
 */
export function coSign(lock: PublicKey, txBase64: string): CoSignResult {
  const holder = deriveHolder(lock);
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  if (!tx.recentBlockhash) throw new Error("missing blockhash");

  const names = discriminators();
  let holderUsed = false;
  let programIxs = 0;
  for (const ix of tx.instructions) {
    if (ix.programId.equals(ComputeBudgetProgram.programId)) continue;
    if (!ix.programId.equals(PROGRAM_ID)) throw new Error(`refusing to sign instruction for ${ix.programId.toBase58()}`);
    const name = names.get(Buffer.from(ix.data.subarray(0, 8)).toString("hex"));
    if (!name || !ALLOWED_IX_NAMES.has(name)) throw new Error(`instruction not allowed: ${name ?? "unknown"}`);
    programIxs++;
    // the lock account must be the one this holder was derived for
    const lockIn = ix.keys.some((k) => k.pubkey.equals(lock));
    if (!lockIn) throw new Error("lock account not present in instruction");
    // holder must be listed as signer; any other signer requirement stays with the wallet
    for (const k of ix.keys) if (k.pubkey.equals(holder.publicKey) && k.isSigner) holderUsed = true;
  }
  if (programIxs === 0) throw new Error("no program instruction");
  if (!holderUsed) throw new Error("holder is not a signer in this transaction");
  // the holder must never be the fee payer
  if (tx.feePayer && tx.feePayer.equals(holder.publicKey)) throw new Error("holder cannot pay fees");

  tx.partialSign(holder);
  return { ok: true, tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), holder: holder.publicKey.toBase58() };
}
