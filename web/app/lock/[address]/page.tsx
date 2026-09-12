"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import LockCard from "@/components/LockCard";
import { useProgram } from "@/hooks/useProgram";
import { ConfigAccount, LockAccount, fetchConfig, fetchLock } from "@/lib/program";

export default function LockPage() {
  const { address } = useParams<{ address: string }>();
  const { publicKey } = useWallet();
  const program = useProgram();
  const [lock, setLock] = useState<LockAccount | null | undefined>(undefined);
  const [config, setConfig] = useState<ConfigAccount | null>(null);

  const load = async () => {
    try {
      const pk = new PublicKey(address);
      const [l, c] = await Promise.all([fetchLock(program, pk), fetchConfig(program)]);
      setLock(l);
      setConfig(c);
    } catch {
      setLock(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, address]);

  if (lock === undefined) return <div className="text-slate-400">Loading…</div>;
  if (lock === null) return <div className="card p-8 text-center">Lock not found (or already closed).</div>;

  const isOwner = !!publicKey && publicKey.equals(lock.owner);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">Lock proof</h1>
      <p className="mb-5 text-sm text-slate-400">
        This page reads directly from the Solana blockchain. Anyone can verify the lock and its unlock time.
      </p>
      <LockCard lock={lock} config={config} readOnly={!isOwner} onChanged={load} />
    </div>
  );
}
