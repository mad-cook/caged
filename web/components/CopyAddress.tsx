"use client";

import { useState } from "react";
import { shortAddr } from "@/lib/format";

/** Inline address that copies itself to the clipboard on click. */
export default function CopyAddress({
  address,
  label,
  full = false,
  className = "",
}: {
  address: string;
  label?: string;
  full?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the address stays selectable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${address}`}
      aria-label={`Copy address ${address}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-ink-700 bg-ink-950/60 px-2 py-0.5 font-mono text-xs text-slate-300 transition-colors hover:border-acid/60 hover:text-white ${className}`}
    >
      {label && <span className="font-sans text-slate-500">{label}</span>}
      <span className={full ? "break-all" : ""}>{full ? address : shortAddr(address, 5)}</span>
      <span className={`font-sans text-[10px] ${copied ? "text-acid" : "text-slate-500"}`}>{copied ? "copied ✓" : "⧉"}</span>
    </button>
  );
}
