/**
 * Owner-side cleanup of a custodial lock after unlock: withdraw + close.
 *   ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<owner keypair> LOCK_MASTER_SECRET=<secret> LOCK=<lock pubkey> npx ts-node scripts/cleanup-custodial-lock.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { createHmac } from "crypto";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(new Connection(env.connection.rpcEndpoint, "confirmed"), env.wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const conn = provider.connection;
  const owner = provider.wallet.publicKey;
  const lock = new PublicKey(process.env.LOCK!);
  const l = await program.account.lock.fetch(lock);
  if (l.vaultBump !== 0) throw new Error("not a custodial lock");
  const seed = createHmac("sha512", Buffer.from(process.env.LOCK_MASTER_SECRET!, "utf8")).update(Buffer.from("caged-holder-v1")).update(lock.toBuffer()).digest().subarray(0, 32);
  const holder = Keypair.fromSeed(seed);
  if (!holder.publicKey.equals(l.vaultAuthority)) throw new Error("derived holder does not match lock");
  const tp = (await conn.getAccountInfo(l.mint))!.owner;
  const ata = (o: PublicKey) => getAssociatedTokenAddressSync(l.mint, o, true, tp, ASSOCIATED_TOKEN_PROGRAM_ID);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const config = await program.account.config.fetch(configPda);
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("boost"), l.mint.toBuffer()], program.programId);
  const poolAcc = (await conn.getAccountInfo(pool)) ? pool : null;
  if (!l.withdrawn) {
    const sig = await program.methods.withdrawCustodial().accountsPartial({
      owner, lock, mint: l.mint, ownerTokenAccount: ata(owner), holder: holder.publicKey, vault: ata(holder.publicKey), boostPool: poolAcc,
      tokenProgram: tp, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([holder]).rpc();
    console.log("withdrawn", sig);
  }
  const sig2 = await program.methods.closeLockCustodial().accountsPartial({
    config: configPda, treasury: config.treasury, owner, lock, holder: holder.publicKey, systemProgram: SystemProgram.programId,
  }).signers([holder]).rpc();
  console.log("closed", sig2);
}
main().catch((e) => { console.error(e); process.exit(1); });
