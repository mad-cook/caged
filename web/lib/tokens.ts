/**
 * Wallet token discovery + metadata (Helius DAS via our /api/token route so the
 * browser never talks to Helius with a server key).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./constants";
import { getLaunchStatuses, PumpStatus } from "./pump";

export interface TokenMeta {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  decimals: number;
}

export interface WalletToken extends TokenMeta {
  tokenProgram: string;
  tokenAccount: string;
  rawAmount: bigint;
  pump: PumpStatus;
}

const metaCache = new Map<string, TokenMeta>();

export async function fetchTokenMeta(mints: string[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  const missing: string[] = [];
  for (const m of mints) {
    const c = metaCache.get(m);
    if (c) out.set(m, c);
    else missing.push(m);
  }
  if (missing.length) {
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mints: missing }),
    });
    if (res.ok) {
      const data = (await res.json()) as { tokens: TokenMeta[] };
      for (const t of data.tokens) {
        metaCache.set(t.mint, t);
        out.set(t.mint, t);
      }
    }
  }
  return out;
}

export async function fetchWalletTokens(connection: Connection, owner: PublicKey): Promise<WalletToken[]> {
  const [legacy, t22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
  ]);

  const rows: { mint: string; tokenProgram: string; tokenAccount: string; rawAmount: bigint; decimals: number }[] = [];
  for (const [list, prog] of [
    [legacy.value, TOKEN_PROGRAM_ID],
    [t22.value, TOKEN_2022_PROGRAM_ID],
  ] as const) {
    for (const acc of list) {
      const info = acc.account.data.parsed.info;
      const raw = BigInt(info.tokenAmount.amount);
      if (raw === 0n) continue;
      rows.push({
        mint: info.mint,
        tokenProgram: prog.toBase58(),
        tokenAccount: acc.pubkey.toBase58(),
        rawAmount: raw,
        decimals: info.tokenAmount.decimals,
      });
    }
  }
  if (rows.length === 0) return [];

  const mints = rows.map((r) => new PublicKey(r.mint));
  const [statuses, metas] = await Promise.all([
    getLaunchStatuses(connection, mints),
    fetchTokenMeta(rows.map((r) => r.mint)),
  ]);

  const tokens: WalletToken[] = rows.map((r) => {
    const meta = metas.get(r.mint);
    return {
      mint: r.mint,
      name: meta?.name || "Unknown",
      symbol: meta?.symbol || r.mint.slice(0, 4),
      image: meta?.image ?? null,
      decimals: r.decimals,
      tokenProgram: r.tokenProgram,
      tokenAccount: r.tokenAccount,
      rawAmount: r.rawAmount,
      pump: statuses.get(r.mint)!,
    };
  });

  // Holder-reward coins first, then other pump coins, then the rest.
  tokens.sort((a, b) => {
    const score = (t: WalletToken) => (t.pump.isHolderReward ? 2 : t.pump.isPump || t.pump.launchpad === "stonk" ? 1 : 0);
    return score(b) - score(a) || a.symbol.localeCompare(b.symbol);
  });
  return tokens;
}
