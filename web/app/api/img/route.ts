import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/img?u=<url>
 * Same-origin image proxy. ipfs.io 403s browsers (Cross-Origin-Resource-Policy),
 * so /ipfs/<cid> URLs are retried across gateways that do answer.
 */
const GATEWAYS = [
  (cid: string) => `https://pump.mypinata.cloud/ipfs/${cid}?img-width=256&img-dpr=2`,
  (cid: string) => `https://ipfs.filebase.io/ipfs/${cid}`,
  (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];
const TIMEOUT_MS = 6000;
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol)) return new NextResponse("bad url", { status: 400 });

  const cid = target.pathname.match(/\/ipfs\/([^/?#]+)/)?.[1];
  const candidates = cid ? GATEWAYS.map((g) => g(cid)) : [target.toString()];

  for (const url of candidates) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "image/*" }, cache: "no-store" });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) continue;
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_BYTES) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) continue;
      return new NextResponse(buf, {
        headers: {
          "content-type": type,
          "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      /* next gateway */
    } finally {
      clearTimeout(t);
    }
  }
  return new NextResponse("not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
}
