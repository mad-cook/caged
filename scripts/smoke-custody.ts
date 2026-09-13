/**
 * Mainnet/devnet smoke test of the custodial flow with real (tiny) amounts.
 * Uses the same holder derivation as the web signing service (LOCK_MASTER_SECRET).
 *
 *   ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<owner keypair> LOCK_MASTER_SECRET=<secret> \
 *   MINT=<mint> AMOUNT=1000000 npx ts-node scripts/smoke-custody.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { createHmac } from "crypto";
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

function deriveAuthority(): Keypair {
  const seed = createHmac("sha512", Buffer.from(process.env.LOCK_MASTER_SECRET!, "utf8")).update(Buffer.from("caged-custody-authority-v1")).digest().subarray(0, 32);
  return Keypair.fromSeed(seed);
}
function deriveHolder(lock: PublicKey): Keypair {
  const seed = createHmac("sha512", Buffer.from(process.env.LOCK_MASTER_SECRET!, "utf8"))
    .update(Buffer.from("caged-holder-v1"))
    .update(lock.toBuffer())
    .digest()
    .subarray(0, 32);
  return Keypair.fromSeed(seed);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(new (require("@solana/web3.js").Connection)(env.connection.rpcEndpoint, "confirmed"), env.wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const conn = provider.connection;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const mint = new PublicKey(process.env.MINT!);
  const amount = new BN(process.env.AMOUNT ?? "1000000");
  const mintInfo = await conn.getAccountInfo(mint);
  const tokenProgram = mintInfo!.owner;
  const ata = (o: PublicKey, m: PublicKey) => getAssociatedTokenAddressSync(m, o, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const config = await program.account.config.fetch(configPda);
  const [boostPool] = PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], program.programId);
  const pool = (await conn.getAccountInfo(boostPool)) ? boostPool : null;
  const chainNow = async () => {
    let slot = await conn.getSlot("confirmed");
    for (let i = 0; i < 8; i++, slot--) {
      const t = await conn.getBlockTime(slot).catch(() => null);
      if (t) return t;
    }
    return Math.floor(Date.now() / 1000);
  };
  const authority = deriveAuthority();
  const [custodyConfig] = PublicKey.findProgramAddressSync([Buffer.from("custody")], program.programId);
  const common = { config: configPda, treasury: config.treasury, tokenProgram, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId };
  const log = (...a: any[]) => console.log("SMOKE", ...a);
  log("owner", owner.publicKey.toBase58(), "SOL", (await conn.getBalance(owner.publicKey)) / 1e9, "| pool", pool ? "yes" : "none");

  // ---------- 1. custodial lock: create -> claim SOL -> withdraw -> close ----------
  const id1 = new BN(Date.now());
  const [lock1] = PublicKey.findProgramAddressSync([Buffer.from("lock"), owner.publicKey.toBuffer(), id1.toArrayLike(Buffer, "le", 8)], program.programId);
  const h1 = deriveHolder(lock1);
  const unlock1 = (await chainNow()) + 75;
  let sig = await program.methods
    .createLockCustodial(id1, amount, new BN(unlock1))
    .accountsPartial({ ...common, owner: owner.publicKey, mint, ownerTokenAccount: ata(owner.publicKey, mint), lock: lock1, custodyConfig, custodyAuthority: authority.publicKey, holder: h1.publicKey, vault: ata(h1.publicKey, mint), boostPool: pool })
    .signers([h1, authority])
    .rpc();
  log("1a custodial lock created", lock1.toBase58(), "holder", h1.publicKey.toBase58(), "on-curve", PublicKey.isOnCurve(h1.publicKey.toBytes()), sig.slice(0, 12));
  const l1 = await program.account.lock.fetch(lock1);
  if (l1.vaultBump !== 0 || !l1.vaultAuthority.equals(h1.publicKey)) throw new Error("lock not custodial");
  log("   vault balance", (await getAccount(conn, ata(h1.publicKey, mint), "confirmed", tokenProgram)).amount.toString(), "| holder lamports", await conn.getBalance(h1.publicKey));

  // simulate a distribution: 0.005 SOL to the holder
  await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: h1.publicKey, lamports: 0.005 * LAMPORTS_PER_SOL })));
  for (let i = 0; i < 30 && (await conn.getBalance(h1.publicKey, "confirmed")) <= 650_240; i++) await sleep(1500);
  log("   holder now", await conn.getBalance(h1.publicKey, "confirmed"), "lamports");
  const tBefore = await conn.getBalance(config.treasury);
  sig = await program.methods
    .claimSolRewardsCustodial()
    .accountsPartial({ config: configPda, treasury: config.treasury, owner: owner.publicKey, lock: lock1, holder: h1.publicKey, boostPool: pool, systemProgram: SystemProgram.programId })
    .signers([h1])
    .rpc();
  log("1b claimed SOL rewards; treasury +", ((await conn.getBalance(config.treasury)) - tBefore) / 1e9, "SOL | holder back to", await conn.getBalance(h1.publicKey), sig.slice(0, 12));

  while ((await chainNow()) < unlock1 + 2) await sleep(3000);
  sig = await program.methods
    .withdrawCustodial()
    .accountsPartial({ owner: owner.publicKey, lock: lock1, mint, ownerTokenAccount: ata(owner.publicKey, mint), holder: h1.publicKey, vault: ata(h1.publicKey, mint), boostPool: pool, tokenProgram, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .signers([h1])
    .rpc();
  log("1c withdrawn after unlock", sig.slice(0, 12));
  sig = await program.methods
    .closeLockCustodial()
    .accountsPartial({ config: configPda, treasury: config.treasury, owner: owner.publicKey, lock: lock1, holder: h1.publicKey, systemProgram: SystemProgram.programId })
    .signers([h1])
    .rpc();
  log("1d closed; holder lamports", await conn.getBalance(h1.publicKey), "lock exists", !!(await conn.getAccountInfo(lock1)), sig.slice(0, 12));

  // ---------- 2. trustless lock -> migrate to custody ----------
  const id2 = new BN(Date.now() + 1);
  const [lock2] = PublicKey.findProgramAddressSync([Buffer.from("lock"), owner.publicKey.toBuffer(), id2.toArrayLike(Buffer, "le", 8)], program.programId);
  const [va2] = PublicKey.findProgramAddressSync([Buffer.from("vault"), lock2.toBuffer()], program.programId);
  const unlock2 = (await chainNow()) + 3600;
  sig = await program.methods
    .createLock(id2, amount, new BN(unlock2))
    .accountsPartial({ ...common, owner: owner.publicKey, mint, ownerTokenAccount: ata(owner.publicKey, mint), lock: lock2, vaultAuthority: va2, vault: ata(va2, mint), boostPool: pool })
    .rpc();
  log("2a trustless lock created", lock2.toBase58(), sig.slice(0, 12));
  const h2 = deriveHolder(lock2);
  sig = await program.methods
    .migrateLockToCustodial()
    .accountsPartial({ ...common, owner: owner.publicKey, lock: lock2, mint, oldVaultAuthority: va2, oldVault: ata(va2, mint), custodyConfig, custodyAuthority: authority.publicKey, holder: h2.publicKey, newVault: ata(h2.publicKey, mint) })
    .signers([h2, authority])
    .rpc();
  const l2 = await program.account.lock.fetch(lock2);
  log("2b migrated: custodial", l2.vaultBump === 0, "| holder", l2.vaultAuthority.toBase58(), "| amount", l2.amount.toString(), "| unlock unchanged", l2.unlockTs.toNumber() === unlock2, "| old vault closed", !(await conn.getAccountInfo(ata(va2, mint))), "| new vault", (await getAccount(conn, ata(h2.publicKey, mint), "confirmed", tokenProgram)).amount.toString(), sig.slice(0, 12));
  log("2c lock2 left open (1h) as a live custodial lock; owner SOL now", (await conn.getBalance(owner.publicKey)) / 1e9);
  log("ALL OK");
}
main().catch((e) => { console.error("SMOKE FAILED", e); process.exit(1); });
