/**
 * Admin: register (or rotate) the custody authority derived from LOCK_MASTER_SECRET.
 *
 *   ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<admin keypair> LOCK_MASTER_SECRET=<secret> npx ts-node scripts/set-custody-authority.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { createHmac } from "crypto";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const seed = createHmac("sha512", Buffer.from(process.env.LOCK_MASTER_SECRET!, "utf8")).update(Buffer.from("caged-custody-authority-v1")).digest().subarray(0, 32);
  const authority = Keypair.fromSeed(seed).publicKey;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [custodyConfig] = PublicKey.findProgramAddressSync([Buffer.from("custody")], program.programId);
  const sig = await program.methods
    .setCustodyAuthority(authority)
    .accountsPartial({ admin: provider.wallet.publicKey, config: configPda, custodyConfig, systemProgram: SystemProgram.programId })
    .rpc();
  const c = await program.account.custodyConfig.fetch(custodyConfig);
  console.log("custody authority set:", c.authority.toBase58(), "tx", sig);
}
main().catch((e) => { console.error(e); process.exit(1); });
