// Simulates create_lock_custodial and prints full program logs (debug helper).
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { createHmac } from "crypto";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const conn = provider.connection;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const mint = new PublicKey(process.env.MINT!);
  const tp = (await conn.getAccountInfo(mint))!.owner;
  const ata = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true, tp, ASSOCIATED_TOKEN_PROGRAM_ID);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const config = await program.account.config.fetch(configPda);
  const id = new BN(Date.now());
  const [lock] = PublicKey.findProgramAddressSync([Buffer.from("lock"), owner.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)], program.programId);
  const seed = createHmac("sha512", Buffer.from(process.env.LOCK_MASTER_SECRET!, "utf8")).update(Buffer.from("caged-holder-v1")).update(lock.toBuffer()).digest().subarray(0, 32);
  const h = Keypair.fromSeed(seed);
  const now = (await conn.getBlockTime(await conn.getSlot("confirmed")))!;
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], program.programId);
  for (const withPool of [false, true]) {
    const tx = await program.methods
      .createLockCustodial(id, new BN(process.env.AMOUNT ?? "1000000"), new BN(now + 75))
      .accountsPartial({
        config: configPda, treasury: config.treasury, owner: owner.publicKey, mint, ownerTokenAccount: ata(owner.publicKey),
        lock, holder: h.publicKey, vault: ata(h.publicKey), boostPool: withPool ? pool : null,
        tokenProgram: tp, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .transaction();
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.feePayer = owner.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(owner, h);
    const sim = await conn.simulateTransaction(tx);
    console.log("withPool", withPool, "err", JSON.stringify(sim.value.err), "CU", sim.value.unitsConsumed);
    for (const l of sim.value.logs || []) console.log("  ", l);
  }
}
main().catch((e) => { console.error("SIM ERROR", e); process.exit(1); });
