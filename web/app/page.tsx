"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CreateLockForm from "@/components/CreateLockForm";
import TokenSearch from "@/components/TokenSearch";
import { useProgram } from "@/hooks/useProgram";
import { ConfigAccount, fetchConfig } from "@/lib/program";
import { lamportsToSol } from "@/lib/format";
import { BRAND_MINT, BRAND_NAME } from "@/lib/constants";

export default function Home() {
  const program = useProgram();
  const [config, setConfig] = useState<ConfigAccount | null>(null);
  useEffect(() => {
    fetchConfig(program).then(setConfig).catch(() => null);
  }, [program]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <section>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Lock your pump.fun coins.
          <br />
          <span className="text-acid">Keep the holder rewards.</span>
        </h1>
        <p className="mt-4 max-w-xl text-slate-300">
          Pump.fun now pays trading fees to <em>holders</em>. Regular lockers move your tokens into a shared
          contract vault, so you stop being a holder. Here every lock is its own on-chain holder address. The
          distributions land on your lock, and you claim them whenever you like.
        </p>

        <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          {[
            ["Pick a date & time", "Tokens stay locked until then. Extend any time, never shorten."],
            ["Stay a holder", "Each lock owns its own token account. Pump.fun sees a normal holder."],
            ["Claim rewards any time", "SOL rewards pile up on the lock. One click sends them to your wallet."],
            ["Public proof", "Every lock has a shareable page your community can verify on-chain."],
          ].map(([t, d]) => (
            <li key={t} className="card p-4">
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-slate-400">{d}</div>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <TokenSearch />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat label="Locks created" value={config ? config.totalLocks.toString() : "—"} />
          <Stat label="Rewards paid out" value={config ? `${lamportsToSol(config.totalRewardsPaid, 2)} SOL` : "—"} />
          <Stat label="Reward fee" value={config ? `${config.rewardFeeBps / 100}%` : "—"} />
        </div>

        {BRAND_MINT && (
          <div className="card mt-6 border-acid/40 p-4">
            <div className="text-sm font-semibold text-acid">🔥 {BRAND_NAME} holders: 2x rewards</div>
            <p className="mt-1 text-sm text-slate-300">
              Lock {BRAND_NAME} for 7 days or more and the first 25% of supply locked earns double holder rewards,
              paid from the team&apos;s own locked allocation.
            </p>
            <Link href="/how-it-works#boost" className="mt-2 inline-block text-xs underline">
              How the boost works
            </Link>
          </div>
        )}
      </section>

      <section>
        <CreateLockForm />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="font-mono text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
