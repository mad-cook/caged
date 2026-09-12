"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import LockCard from "@/components/LockCard";
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
      <div className="card p-8 text-center text-slate-300">Connect your wallet to see your locks.</div>
    );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My locks</h1>
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
        <div className="card p-8 text-center text-slate-300">
          No locks yet.{" "}
          <Link href="/" className="underline">
            Create one
          </Link>
          .
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
