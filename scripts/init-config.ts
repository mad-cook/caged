/**
 * One-time protocol initialization (or update) on the target cluster.
 *
 *   ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=... \
 *   ANCHOR_WALLET=~/solana-keypair.json \
 *   TREASURY=<pubkey> LOCK_FEE_SOL=0.1 REWARD_FEE_BPS=200 \
 *   npx ts-node scripts/init-config.ts
 *
 * Re-running with the config already initialized performs an update_config
 * with the same values (admin only).
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/holder_locker.json";
import type { HolderLocker } from "../target/types/holder_locker";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program<HolderLocker>(idl as HolderLocker, provider);

  const treasury = new PublicKey(process.env.TREASURY ?? provider.wallet.publicKey.toBase58());
  const lockFee = new anchor.BN(Math.round(parseFloat(process.env.LOCK_FEE_SOL ?? "0.1") * 1e9));
  const rewardFeeBps = parseInt(process.env.REWARD_FEE_BPS ?? "200", 10);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const existing = await program.account.config.fetchNullable(config);

  if (!existing) {
    const sig = await program.methods
      .initialize({ treasury, lockFeeLamports: lockFee, rewardFeeBps })
      .accounts({ admin: provider.wallet.publicKey })
      .rpc();
    console.log("initialized", config.toBase58(), sig);
  } else {
    const sig = await program.methods
      .updateConfig({
        treasury,
        lockFeeLamports: lockFee,
        rewardFeeBps,
        paused: process.env.PAUSED ? process.env.PAUSED === "true" : null,
        newAdmin: process.env.NEW_ADMIN ? new PublicKey(process.env.NEW_ADMIN) : null,
      })
      .accounts({ admin: provider.wallet.publicKey })
      .rpc();
    console.log("updated", config.toBase58(), sig);
  }
  const c = await program.account.config.fetch(config);
  console.log({
    admin: c.admin.toBase58(),
    treasury: c.treasury.toBase58(),
    lockFeeSol: c.lockFeeLamports.toNumber() / 1e9,
    rewardFeeBps: c.rewardFeeBps,
    paused: c.paused,
    totalLocks: c.totalLocks.toString(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
