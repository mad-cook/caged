import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || "mainnet-beta";
const DAS_URL = HELIUS_KEY
  ? `https://${CLUSTER === "devnet" ? "devnet" : "mainnet"}.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : null;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface TokenMeta {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  decimals: number;
}

// Tiny in-memory cache; Railway runs one instance so this is enough.
const cache = new Map<string, { at: number; v: TokenMeta }>();
const TTL = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  let mints: string[] = [];
  try {
    const body = await req.json();
    mints = Array.isArray(body?.mints) ? body.mints : [];
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  mints = Array.from(new Set(mints.filter((m) => typeof m === "string" && BASE58.test(m)))).slice(0, 200);

  const tokens: TokenMeta[] = [];
  const missing: string[] = [];
  const now = Date.now();
  for (const m of mints) {
    const c = cache.get(m);
    if (c && now - c.at < TTL) tokens.push(c.v);
    else missing.push(m);
  }

  if (missing.length && DAS_URL) {
    try {
      const res = await fetch(DAS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "meta",
          method: "getAssetBatch",
          params: { ids: missing },
        }),
        cache: "no-store",
      });
      const json = await res.json();
      const assets: any[] = Array.isArray(json?.result) ? json.result : [];
      for (const a of assets) {
        if (!a?.id) continue;
        const meta: TokenMeta = {
          mint: a.id,
          name: a.content?.metadata?.name || a.token_info?.symbol || "Unknown",
          symbol: a.content?.metadata?.symbol || a.token_info?.symbol || "",
          image: a.content?.links?.image || a.content?.files?.[0]?.cdn_uri || a.content?.files?.[0]?.uri || null,
          decimals: typeof a.token_info?.decimals === "number" ? a.token_info.decimals : 6,
        };
        cache.set(meta.mint, { at: now, v: meta });
        tokens.push(meta);
      }
    } catch (e) {
      console.error("DAS getAssetBatch failed", e);
    }
  }

  return NextResponse.json({ tokens });
}
