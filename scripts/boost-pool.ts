/**
 * Manage a boost pool for a mint (admin / pool authority).
 *
 *   ANCHOR_PROVIDER_URL=... ANCHOR_WALLET=... \
 *   MINT=<mint> ACTION=create CAPACITY_PCT=25 MIN_DAYS=7 BONUS_BPS=10000 npx ts-node scripts/boost-pool.ts
 *   MINT=<mint> ACTION=fund SOL=5 npx ts-node scripts/boost-pool.ts
 *   MINT=<mint> ACTION=withdraw SOL=1 npx ts-node scripts/boost-pool.ts
 *   MINT=<mint> ACTION=update ACTIVE=false npx ts-node scripts/boost-pool.ts
 *   MINT=<mint> ACTION=show npx ts-node scripts/boost-pool.ts
 *
 * CAPACITY_PCT is a percentage of the mint's current supply; CAPACITY_RAW
 * overrides it with an exact raw amount.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);
  const conn = provider.connection;

  const mint = new PublicKey(process.env.MINT!);
  const action = process.env.ACTION ?? "show";
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("boost"), mint.toBuffer()], program.programId);

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
    const sig = await program.methods
      .createBoostPool(capacity, minDuration, bonusBps)
      .accounts({ admin: provider.wallet.publicKey, mint })
      .rpc();
    console.log("created", pool.toBase58(), sig);
  } else if (action === "fund") {
    const lamports = new anchor.BN(Math.round(parseFloat(process.env.SOL ?? "0") * 1e9));
    const sig = await program.methods
      .fundBoostPool(lamports)
      .accountsPartial({ funder: provider.wallet.publicKey, boostPool: pool })
      .rpc();
    console.log("funded", sig);
  } else if (action === "withdraw") {
    const lamports = new anchor.BN(Math.round(parseFloat(process.env.SOL ?? "0") * 1e9));
    const sig = await program.methods
      .withdrawBoostPool(lamports)
      .accountsPartial({ authority: provider.wallet.publicKey, boostPool: pool })
      .rpc();
    console.log("withdrawn", sig);
  } else if (action === "update") {
    const sig = await program.methods
      .updateBoostPool({
        capacity: process.env.CAPACITY_RAW ? new anchor.BN(process.env.CAPACITY_RAW) : null,
        minDuration: process.env.MIN_DAYS ? new anchor.BN(Math.round(parseFloat(process.env.MIN_DAYS) * 86400)) : null,
        bonusBps: process.env.BONUS_BPS ? parseInt(process.env.BONUS_BPS, 10) : null,
        active: process.env.ACTIVE ? process.env.ACTIVE === "true" : null,
        newAuthority: process.env.NEW_AUTHORITY ? new PublicKey(process.env.NEW_AUTHORITY) : null,
      })
      .accountsPartial({ authority: provider.wallet.publicKey, boostPool: pool })
      .rpc();
    console.log("updated", sig);
  }

  const acc = await program.account.boostPool.fetchNullable(pool);
  const info = await conn.getAccountInfo(pool);
  console.log(
    acc
      ? {
          pool: pool.toBase58(),
          mint: acc.mint.toBase58(),
          authority: acc.authority.toBase58(),
          capacity: acc.capacity.toString(),
          enrolled: acc.enrolled.toString(),
          minDays: acc.minDuration.toNumber() / 86400,
          bonusBps: acc.bonusBps,
          active: acc.active,
          totalBonusPaidSol: acc.totalBonusPaid.toNumber() / 1e9,
          balanceSol: (info?.lamports ?? 0) / 1e9,
        }
      : "no pool",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
