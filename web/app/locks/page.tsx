"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import LockCard from "@/components/LockCard";
import BrandMark from "@/components/BrandMark";
import WalletButton from "@/components/WalletButton";
import { useProgram } from "@/hooks/useProgram";
import { ConfigAccount, LockAccount, fetchConfig, fetchLocksByOwner } from "@/lib/program";

export default function MyLocks() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const [locks, setLocks] = useState<LockAccount[] | null>(null);
  const [config, setConfig] = useState<ConfigAccount | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return setLocks(null);
    try {
      setErr(null);
      const [l, c] = await Promise.all([fetchLocksByOwner(program, publicKey), fetchConfig(program)]);
      setLocks(l);
      setConfig(c);
    } catch (e: any) {
      setErr(e?.message || "Failed to load locks");
    }
  }, [program, publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (!publicKey)
    return (
      <div className="mx-auto max-w-3xl py-4 sm:py-8">
        <p className="eyebrow mb-4">Your conviction, all in one place</p>
        <h1 className="page-title mb-8">My locks</h1>
        <div className="empty-state">
          <BrandMark className="mb-6 h-24 w-20" />
          <h2 className="section-title">Your locks are waiting.</h2>
          <p className="mb-7 mt-4 max-w-md text-sm leading-relaxed text-slate-400">Connect your wallet to view your locked tokens, claim eligible rewards and manage your unlock dates.</p>
          <WalletButton />
          <Link href="/how-it-works" className="mt-5 min-h-11 py-3 text-xs text-acid hover:underline">New here? See how it works →</Link>
        </div>
      </div>
    );

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="eyebrow mb-3">Your conviction, on-chain</p><h1 className="page-title">My locks</h1></div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={load}>
            Refresh
          </button>
          <Link href="/" className="btn-primary">
            New lock
          </Link>
        </div>
      </div>
      {err && <div className="mb-4 text-sm text-ember">{err}</div>}
      {locks === null && <div className="text-slate-400">Loading…</div>}
      {locks && locks.length === 0 && (
        <div className="empty-state">
          <BrandMark className="mb-5 h-20 w-16" />
          <h2 className="section-title">Make your first commitment.</h2>
          <p className="my-5 text-sm text-slate-400">Your locks and eligible rewards will appear here.</p>
          <Link href="/#create-lock" className="btn-primary">Create a lock →</Link>
        </div>
      )}
      <div className="grid gap-4">
        {locks?.map((l) => (
          <LockCard key={l.publicKey.toBase58()} lock={l} config={config} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
