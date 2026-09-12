"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import CreateLockForm from "@/components/CreateLockForm";
import TokenSearch from "@/components/TokenSearch";
import BrandMark from "@/components/BrandMark";
import ContractAddress from "@/components/ContractAddress";
import { useProgram } from "@/hooks/useProgram";
import { ConfigAccount, fetchConfig } from "@/lib/program";
import { lamportsToSol } from "@/lib/format";
import { BRAND_MINT, BRAND_NAME } from "@/lib/constants";

export default function Home() {
  const program = useProgram();
  const [config, setConfig] = useState<ConfigAccount | null>(null);
  useEffect(() => { fetchConfig(program).then(setConfig).catch(() => null); }, [program]);

  return (
    <div>
      <section className="hero" aria-labelledby="hero-title">
        <div className="relative z-10">
          <div className="eyebrow mb-6 flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-acid" />Public conviction. On Solana.</div>
          <h1 id="hero-title" className="display-title hero-title">Diamond balls.<br /><span className="text-acid">On lock.</span></h1>
          <p className="mt-6 text-lg font-medium text-slate-100 sm:text-xl">Show your conviction. Lock your tokens.</p>
          <p className="mt-3 max-w-[470px] text-sm leading-relaxed text-slate-400 sm:text-base">Back the projects you believe in with a public token lock. Keep claiming eligible holder rewards while your tokens stay locked.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#create-lock" className="btn-primary min-w-[172px]">Create a lock <span aria-hidden="true">↗</span></a>
            <a href="#explore" className="btn-ghost">Explore locks <span aria-hidden="true">→</span></a>
          </div>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500"><span>◇ Public proof</span><span>◇ Claim while locked</span><span>◇ Your unlock date</span></p>
          <ContractAddress />
        </div>
        <div className="hero-art">
          <Image src="/brand/locked-diamonds.webp" alt="The Caged Diamond Balls emblem: icy diamonds held in a polished chrome cage with a closed padlock" width={768} height={967} priority unoptimized className="hero-emblem" />
          <span className="hero-mini-label" aria-hidden="true">CONVICTION LOOKS GOOD ON YOU</span>
          <div className="hero-art-caption">CAGED DIAMOND BALLS <span className="text-acid">/ $CAGED</span></div>
        </div>
      </section>

      <section aria-label="Protocol statistics" className="stats-strip mt-5">
        <Stat label="Locks created" value={config ? config.totalLocks.toString() : "—"} />
        <Stat label="Rewards paid out" value={config ? lamportsToSol(config.totalRewardsPaid, 2) + " SOL" : "—"} />
        <Stat label="Fee on reward claims" value={config ? config.rewardFeeBps / 100 + "%" : "—"} />
      </section>

      <section id="create-lock" aria-labelledby="create-heading" className="grid gap-8 py-14 sm:py-20 lg:grid-cols-[.95fr_1fr] lg:gap-16">
        <div className="pt-2">
          <p className="eyebrow mb-4">Less talk. More conviction.</p>
          <h2 id="create-heading" className="section-title">Your tokens, locked.<br /><span className="text-acid">Your rewards, still yours.</span></h2>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-slate-400">A lock gives your commitment a timestamp. Each lock has its own holder address, so eligible distributions can reach it. Claim your rewards after the displayed fee, without unlocking your tokens.</p>
          <ol className="mt-8 space-y-6">
            {[
              ["Make it official", "Choose a token, an amount and an unlock date. The tokens stay locked until that time."],
              ["Keep the rewards flowing", "Claim eligible rewards to your wallet while your original tokens remain locked."],
              ["Post the proof", "Every lock has a public page. Let your community see your conviction on-chain."],
            ].map(([title, description], i) => <li key={title} className="flex gap-4"><span className="step-number">0{i + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p></div></li>)}
          </ol>
          <Link href="/how-it-works" className="mt-7 inline-flex min-h-11 items-center gap-3 text-xs font-semibold text-acid hover:underline">Get to know your lock <span aria-hidden="true">→</span></Link>
        </div>
        <CreateLockForm />
      </section>

      {BRAND_MINT && <section className="boost-panel card mb-12 grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto]">
        <div className="flex gap-4 sm:gap-6"><BrandMark className="hidden h-20 w-16 shrink-0 sm:block" /><div><p className="eyebrow mb-2">The {BRAND_NAME} reward match</p><h2 className="section-title">A little more conviction.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">Qualifying locks of 7 days or more can earn a 1:1 match on net SOL holder rewards. Enrollment is first come, first served, up to 25% of supply, and bonuses depend on available pool funds.</p></div></div>
        <Link href="/how-it-works#boost" className="btn-ghost">Explore the boost <span aria-hidden="true">↗</span></Link>
      </section>}

      <section id="explore" aria-labelledby="explore-heading" className="card grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr]">
        <div><p className="eyebrow mb-3">All talk? Check the lock.</p><h2 id="explore-heading" className="section-title">Conviction, on the record.</h2><p className="mt-3 text-sm leading-relaxed text-slate-400">Look up a token to see its public locks, committed supply and upcoming unlocks.</p></div>
        <TokenSearch />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="break-words font-mono text-lg font-semibold tracking-tight text-slate-100 sm:text-2xl">{value}</div><div className="mt-1.5 text-[10px] text-slate-500 sm:text-xs">{label}</div></div>;
}
