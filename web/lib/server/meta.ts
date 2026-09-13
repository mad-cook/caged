/**
 * Token metadata resolution (server only).
 * 1. Helius DAS getAssetBatch (fast, indexed).
 * 2. If DAS has no image but knows the metadata JSON URI (common for fresh
 *    pump.fun coins), fetch that JSON and read its `image`.
 */
export interface TokenMeta {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  decimals: number;
}

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || "mainnet-beta";
const DAS_URL = HELIUS_KEY
  ? `https://${CLUSTER === "devnet" ? "devnet" : "mainnet"}.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : null;

const cache = new Map<string, { at: number; v: TokenMeta }>();
const TTL = 10 * 60 * 1000;
const JSON_TIMEOUT_MS = 5000;

export function normalizeUri(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null;
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, "")}`;
  if (u.startsWith("ar://")) return `https://arweave.net/${u.slice(5)}`;
  if (/^https?:\/\//.test(u)) return u;
  return null;
}

async function fetchJsonImage(uri: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), JSON_TIMEOUT_MS);
  try {
    const res = await fetch(uri, { signal: ctrl.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    return normalizeUri(j?.image) ?? normalizeUri(j?.properties?.files?.[0]?.uri) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function resolveTokenMeta(mints: string[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  const now = Date.now();
  const missing: string[] = [];
  for (const m of mints) {
    const c = cache.get(m);
    if (c && now - c.at < TTL) out.set(m, c.v);
    else missing.push(m);
  }
  if (!missing.length || !DAS_URL) return out;

  let assets: any[] = [];
  try {
    const res = await fetch(DAS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "meta", method: "getAssetBatch", params: { ids: missing } }),
      cache: "no-store",
    });
    const json = await res.json();
    assets = Array.isArray(json?.result) ? json.result : [];
  } catch (e) {
    console.error("DAS getAssetBatch failed", e);
    return out;
  }

  await Promise.all(
    assets.map(async (a) => {
      if (!a?.id) return;
      let image =
        normalizeUri(a.content?.links?.image) ??
        normalizeUri(a.content?.files?.[0]?.cdn_uri) ??
        normalizeUri(a.content?.files?.[0]?.uri);
      const jsonUri = normalizeUri(a.content?.json_uri);
      if (!image && jsonUri) image = await fetchJsonImage(jsonUri);
      const meta: TokenMeta = {
        mint: a.id,
        name: a.content?.metadata?.name || a.token_info?.symbol || "Unknown",
        symbol: a.content?.metadata?.symbol || a.token_info?.symbol || "",
        image,
        decimals: typeof a.token_info?.decimals === "number" ? a.token_info.decimals : 6,
      };
      cache.set(meta.mint, { at: now, v: meta });
      out.set(meta.mint, meta);
    }),
  );
  return out;
}
