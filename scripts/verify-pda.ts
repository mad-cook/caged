/**
 * Upload (or update) the OtterSec / solana-verify build-params PDA for the program, then
 * optionally submit a remote verification job to verify.osec.io.
 *
 * This is a Node port of `solana-verify verify-from-repo --remote`; the Rust CLI does not
 * compile on Windows. Wire format copied from solana-verify 0.5.1 (src/solana_program.rs).
 *
 *   ANCHOR_PROVIDER_URL=<mainnet rpc> ANCHOR_WALLET=<upgrade authority keypair> \
 *     npx ts-node scripts/verify-pda.ts --commit <sha> [--simulate] [--submit]
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";

const OTTER_VERIFY = new PublicKey("verifycLy8mB96wd9wqq3WDXQwM4oU6r42Th37Db9fC");
const DISC = {
  initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  update: Buffer.from([219, 200, 88, 176, 158, 63, 253, 127]),
};
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID ?? "65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t");
const GIT_URL = process.env.GIT_URL ?? "https://github.com/mad-cook/caged";
const VERSION = "0.5.1"; // solana-verify CLI version the format mirrors
const BUILD_ARGS = [
  "--library-name", "holder_locker",
  "--base-image", "solanafoundation/solana-verifiable-build:1.18.26",
];

function str(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}
function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}
function encodeParams(p: { version: string; gitUrl: string; commit: string; args: string[]; deployedSlot: bigint }): Buffer {
  const argsLen = Buffer.alloc(4);
  argsLen.writeUInt32LE(p.args.length);
  return Buffer.concat([str(p.version), str(p.gitUrl), str(p.commit), argsLen, ...p.args.map(str), u64(p.deployedSlot)]);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  const conn = provider.connection;
  const signer = provider.wallet.publicKey;
  const commit = arg("--commit");
  if (!commit) throw new Error("--commit <sha> required");
  const simulate = process.argv.includes("--simulate");
  const submit = process.argv.includes("--submit");

  // deployed slot = ProgramData.slot
  const prog = await conn.getParsedAccountInfo(PROGRAM_ID, "confirmed");
  const programData = (prog.value?.data as any)?.parsed?.info?.programData;
  if (!programData) throw new Error("program not upgradeable / not found");
  const pd = await conn.getParsedAccountInfo(new PublicKey(programData), "confirmed");
  const info = (pd.value?.data as any)?.parsed?.info;
  const deployedSlot = BigInt(info.slot);
  console.log("program", PROGRAM_ID.toBase58(), "upgrade authority", info.authority, "deployed slot", deployedSlot.toString());
  if (info.authority !== signer.toBase58()) console.warn("WARNING: wallet is not the upgrade authority; OtterSec only trusts PDAs signed by it");

  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("otter_verify"), signer.toBuffer(), PROGRAM_ID.toBuffer()], OTTER_VERIFY);
  const exists = !!(await conn.getAccountInfo(pda, "confirmed"));
  console.log("build-params PDA", pda.toBase58(), exists ? "(exists → update)" : "(new → initialize)");

  const params = { version: VERSION, gitUrl: GIT_URL, commit, args: BUILD_ARGS, deployedSlot };
  console.log("params", { ...params, deployedSlot: deployedSlot.toString() });
  const data = Buffer.concat([exists ? DISC.update : DISC.initialize, encodeParams(params)]);
  const ix = new TransactionInstruction({
    programId: OTTER_VERIFY,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: signer, isSigner: true, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ix);
  tx.feePayer = signer;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;

  if (simulate) {
    const sim = await conn.simulateTransaction(tx);
    console.log("simulation", sim.value.err ? "FAILED" : "ok", sim.value.err ?? "", "\n" + (sim.value.logs ?? []).join("\n"));
    if (sim.value.err) process.exit(1);
  } else {
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    console.log("PDA written, tx", sig);
  }

  if (submit) {
    const res = await fetch("https://verify.osec.io/verify-with-signer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ program_id: PROGRAM_ID.toBase58(), signer: signer.toBase58(), repository: "", commit_hash: "" }),
    });
    const body = await res.text();
    console.log("remote job", res.status, body);
    const m = body.match(/"request_id"\s*:\s*"([^"]+)"/);
    if (m) console.log("logs: https://verify.osec.io/logs/" + m[1] + "\nstatus: https://verify.osec.io/status/" + PROGRAM_ID.toBase58());
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
