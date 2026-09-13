/**
 * Manage a boost pool for a mint (admin / pool authority).
 *
 *   ANCHOR_PROVIDER_URL=... ANCHOR_WALLET=... MINT=<mint> ACTION=<action> npx ts-node scripts/boost-pool.ts
 *
 * Actions:
 *   create   CAPACITY_PCT=25 (or CAPACITY_RAW) MIN_DAYS=7 BONUS_BPS=10000 [REWARD_MINT=<mint>]
 *            Without REWARD_MINT the pool pays SOL. With it, the pool pays that token; the
 *            pool's token account is created in the same run.
 *   fund     SOL=2            (SOL pools)         | AMOUNT=1.5 (token pools; from the wallet's ATA)
 *   withdraw SOL=1            (SOL pools)         | AMOUNT=1.5 (token pools)
 *   update   CAPACITY_RAW / MIN_DAYS / BONUS_BPS / ACTIVE=true|false / NEW_AUTHORITY
 *   show
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const conn = provider.connection;
  const me = provider.wallet.publicKey;

  const mint = new PublicKey(process.env.MINT!);
  const action = process.env.ACTION ?? "show";
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], program.programId);

  const existing = await program.account.boostPool.fetchNullable(pool);
  const rewardMint = existing && !existing.rewardMint.equals(PublicKey.default) ? existing.rewardMint : null;
  const rewardProg = existing ? existing.rewardTokenProgram : null;
  const poolAta = rewardMint ? getAssociatedTokenAddressSync(rewardMint, pool, true, rewardProg!) : null;

  if (action === "create") {
    let capacity: anchor.BN;
    if (process.env.CAPACITY_RAW) capacity = new anchor.BN(process.env.CAPACITY_RAW);
    else {
      const supply = await conn.getTokenSupply(mint);
      const pct = parseFloat(process.env.CAPACITY_PCT ?? "25");
      capacity = new anchor.BN(supply.value.amount).muln(Math.round(pct * 100)).divn(10_000);
    }
    const minDuration = new anchor.BN(Math.round(parseFloat(process.env.MIN_DAYS ?? "7") * 86400));
    const bonusBps = parseInt(process.env.BONUS_BPS ?? "10000", 10);
    let rm: PublicKey | null = null;
    let rp: PublicKey | null = null;
    if (process.env.REWARD_MINT) {
      rm = new PublicKey(process.env.REWARD_MINT);
      rp = (await conn.getAccountInfo(rm))!.owner;
    }
    const ix = await program.methods
      .createBoostPool(capacity, minDuration, bonusBps)
      .accountsPartial({ admin: me, mint, rewardMint: rm, rewardTokenProgram: rp })
      .instruction();
    const tx = new Transaction().add(ix);
    if (rm && rp) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(me, getAssociatedTokenAddressSync(rm, pool, true, rp), pool, rm, rp, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    const sig = await provider.sendAndConfirm(tx);
    console.log("created", pool.toBase58(), rm ? `(pays ${rm.toBase58()})` : "(pays SOL)", sig);
  } else if (action === "fund") {
    if (rewardMint && poolAta) {
      const mi = await getMint(conn, rewardMint, "confirmed", rewardProg!);
      const raw = BigInt(Math.round(parseFloat(process.env.AMOUNT ?? "0") * 10 ** mi.decimals));
      const from = getAssociatedTokenAddressSync(rewardMint, me, false, rewardProg!);
      const tx = new Transaction()
        .add(createAssociatedTokenAccountIdempotentInstruction(me, poolAta, pool, rewardMint, rewardProg!, ASSOCIATED_TOKEN_PROGRAM_ID))
        .add(createTransferCheckedInstruction(from, rewardMint, poolAta, me, raw, mi.decimals, [], rewardProg!));
      console.log("funded (token)", await provider.sendAndConfirm(tx));
    } else {
      const lamports = new anchor.BN(Math.round(parseFloat(process.env.SOL ?? "0") * 1e9));
      const sig = await program.methods.fundBoostPool(lamports).accountsPartial({ funder: me, boostPool: pool }).rpc();
      console.log("funded (SOL)", sig);
    }
  } else if (action === "withdraw") {
    if (rewardMint && poolAta) {
      const mi = await getMint(conn, rewardMint, "confirmed", rewardProg!);
      const raw = new anchor.BN(Math.round(parseFloat(process.env.AMOUNT ?? "0") * 10 ** mi.decimals).toString());
      const sig = await program.methods
        .withdrawBoostPoolTokens(raw)
        .accountsPartial({
          authority: me,
          boostPool: pool,
          rewardMint,
          poolTokenAccount: poolAta,
          authorityTokenAccount: getAssociatedTokenAddressSync(rewardMint, me, false, rewardProg!),
          rewardTokenProgram: rewardProg!,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("withdrawn (token)", sig);
    } else {
      const lamports = new anchor.BN(Math.round(parseFloat(process.env.SOL ?? "0") * 1e9));
      const sig = await program.methods.withdrawBoostPool(lamports).accountsPartial({ authority: me, boostPool: pool }).rpc();
      console.log("withdrawn (SOL)", sig);
    }
  } else if (action === "update") {
    const sig = await program.methods
      .updateBoostPool({
        capacity: process.env.CAPACITY_RAW ? new anchor.BN(process.env.CAPACITY_RAW) : null,
        minDuration: process.env.MIN_DAYS ? new anchor.BN(Math.round(parseFloat(process.env.MIN_DAYS) * 86400)) : null,
        bonusBps: process.env.BONUS_BPS ? parseInt(process.env.BONUS_BPS, 10) : null,
        active: process.env.ACTIVE ? process.env.ACTIVE === "true" : null,
        newAuthority: process.env.NEW_AUTHORITY ? new PublicKey(process.env.NEW_AUTHORITY) : null,
      })
      .accountsPartial({ authority: me, boostPool: pool })
      .rpc();
    console.log("updated", sig);
  }

  const acc = await program.account.boostPool.fetchNullable(pool);
  if (!acc) return console.log("no pool");
  const info = await conn.getAccountInfo(pool);
  const rm = acc.rewardMint.equals(PublicKey.default) ? null : acc.rewardMint;
  let tokenBalance: string | null = null;
  if (rm) {
    const ata = getAssociatedTokenAddressSync(rm, pool, true, acc.rewardTokenProgram);
    tokenBalance = (await conn.getTokenAccountBalance(ata).catch(() => null))?.value.uiAmountString ?? "0";
  }
  console.log({
    pool: pool.toBase58(),
    mint: acc.mint.toBase58(),
    authority: acc.authority.toBase58(),
    paysIn: rm ? rm.toBase58() : "SOL",
    capacity: acc.capacity.toString(),
    enrolled: acc.enrolled.toString(),
    minDays: acc.minDuration.toNumber() / 86400,
    bonusBps: acc.bonusBps,
    active: acc.active,
    totalBonusPaid: acc.totalBonusPaid.toString(),
    balance: rm ? `${tokenBalance} tokens` : `${(info?.lamports ?? 0) / 1e9} SOL`,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
