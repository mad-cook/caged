/**
 * Token-2022 transfer-hook support for the client: resolve the extra accounts a
 * hooked mint needs and return them as "remaining accounts" for our program.
 * Also classifies quote assets whose extensions make rewards unreachable.
 */
import { AccountMeta, Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID as T22,
  addExtraAccountMetasForExecute,
  createTransferCheckedInstruction,
  getMint,
  getTransferHook,
} from "@solana/spl-token";
import { TOKEN_2022_PROGRAM_ID } from "./constants";

export interface TransferLeg {
  source: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  amount: bigint;
}

/**
 * Extra accounts needed for `transfer_checked` on `mint` for each leg
 * (source -> destination). Empty for legacy SPL mints and hook-less mints.
 * Legs are unioned; an account marked writable in any leg stays writable.
 */
export async function hookRemainingAccounts(
  connection: Connection,
  mint: PublicKey,
  tokenProgram: PublicKey,
  legs: TransferLeg[],
): Promise<AccountMeta[]> {
  if (!tokenProgram.equals(TOKEN_2022_PROGRAM_ID) || legs.length === 0) return [];
  let mintInfo;
  try {
    mintInfo = await getMint(connection, mint, "confirmed", T22);
  } catch {
    return [];
  }
  const hook = getTransferHook(mintInfo);
  if (!hook || hook.programId.equals(PublicKey.default)) return [];

  const merged = new Map<string, AccountMeta>();
  for (const leg of legs) {
    const ix = createTransferCheckedInstruction(
      leg.source,
      mint,
      leg.destination,
      leg.owner,
      leg.amount,
      mintInfo.decimals,
      [],
      T22,
    );
    const before = ix.keys.length;
    try {
      await addExtraAccountMetasForExecute(
        connection,
        ix,
        hook.programId,
        leg.source,
        mint,
        leg.destination,
        leg.owner,
        leg.amount,
        "confirmed",
      );
    } catch (e) {
      console.warn("transfer hook resolution failed", e);
      continue;
    }
    for (const k of ix.keys.slice(before)) {
      const key = k.pubkey.toBase58();
      const prev = merged.get(key);
      merged.set(key, { pubkey: k.pubkey, isSigner: false, isWritable: (prev?.isWritable ?? false) || k.isWritable });
    }
  }
  return Array.from(merged.values());
}

export interface QuoteAssetInfo {
  mint: string;
  tokenProgram: string;
  decimals: number;
  /** a transfer-hook program is actually set (extension present with a null program does not count) */
  hasTransferHook: boolean;
  /** rewards provably cannot be received/claimed right now (frozen-by-default, paused, non-transferable) */
  restricted: boolean;
  reasons: string[];
  /** powers the issuer holds that could affect rewards later (info only) */
  issuerControls: string[];
}

/** Inspect a quote/reward mint's extensions. */
export async function inspectQuoteAsset(connection: Connection, mint: PublicKey): Promise<QuoteAssetInfo | null> {
  const info = await connection.getParsedAccountInfo(mint, "confirmed");
  const v = info.value;
  if (!v || !("parsed" in v.data)) return null;
  const p: any = v.data.parsed.info;
  const exts: any[] = p.extensions || [];
  const state: Record<string, any> = {};
  for (const e of exts) state[e.extension] = e.state ?? {};
  const reasons: string[] = [];
  const issuerControls: string[] = [];

  const das = state.defaultAccountState;
  if (das && String(das.accountState ?? das).toLowerCase().includes("frozen")) {
    reasons.push("new token accounts start frozen until the issuer approves them");
  }
  if (state.pausableConfig) {
    if (state.pausableConfig.paused) reasons.push("transfers are currently paused by the issuer");
    else issuerControls.push("issuer can pause transfers");
  }
  if ("nonTransferable" in state) reasons.push("token is non-transferable");
  if (state.permanentDelegate) issuerControls.push("issuer holds a permanent delegate (can move or burn tokens)");
  const hookProgram = state.transferHook?.programId;
  const hasTransferHook = !!hookProgram && hookProgram !== PublicKey.default.toBase58();
  if (state.transferHook && !hasTransferHook) issuerControls.push("issuer can attach a transfer-hook program");
  if (p.freezeAuthority) issuerControls.push("issuer can freeze accounts");

  return {
    mint: mint.toBase58(),
    tokenProgram: v.owner.toBase58(),
    decimals: p.decimals,
    hasTransferHook,
    restricted: reasons.length > 0,
    reasons,
    issuerControls,
  };
}
