"use client";

import { useState } from "react";
import Link from "next/link";
import { BRAND_MINT, BRAND_NAME, EXPLORER } from "@/lib/constants";

/** Hero "CA" box: shows the brand token mint with one-click copy. */
export default function ContractAddress() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!BRAND_MINT) return;
    try {
      await navigator.clipboard.writeText(BRAND_MINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the address is still selectable */
    }
  }

  return (
    <div className="ca-box mt-7 inline-flex max-w-full flex-wrap items-center gap-3 rounded-[10px] border border-ink-600 bg-ink-900/80 py-2.5 pl-4 pr-2.5">
      <span className="eyebrow !text-[10px]">
        {BRAND_NAME ? `$${BRAND_NAME.replace(/^\$/, "")} CA` : "CA"}
      </span>
      {BRAND_MINT ? (
        <>
          <code className="min-w-0 select-all break-all font-mono text-xs text-slate-100 sm:text-sm" title={BRAND_MINT}>
            {BRAND_MINT}
          </code>
          <button
            type="button"
            onClick={copy}
            aria-live="polite"
            className={`btn !min-h-9 !px-3 !py-1.5 text-xs ${copied ? "bg-acid text-ink-950" : "border border-ink-600 text-slate-200 hover:border-acid/60 hover:text-white"}`}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <Link href={`/token/${BRAND_MINT}`} className="text-xs text-acid hover:underline">
            View locks →
          </Link>
          <a href={EXPLORER(BRAND_MINT)} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-white">
            Solscan ↗
          </a>
        </>
      ) : (
        <span className="font-mono text-xs text-slate-400 sm:text-sm">Coming soon. Only trust the address posted here.</span>
      )}
    </div>
  );
}
