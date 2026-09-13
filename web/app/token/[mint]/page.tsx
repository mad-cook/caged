"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { TokenLocksJson } from "@/lib/server/locks";
import { countdown, durationLabel, formatDate, formatUnits, lamportsToSol, shortAddr } from "@/lib/format";
import { EXPLORER } from "@/lib/constants";
import TokenSearch from "@/components/TokenSearch";

export default function TokenPage() {
  const { mint } = useParams<{ mint: string }>();
  const [data, setData] = useState<TokenLocksJson | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/locks/${mint}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || r.statusText);
          return j as TokenLocksJson;
        })
        .then((d) => alive && setData(d))
        .catch((e) => alive && (setErr(e.message), setData(null)));
    load();
    const t = setInterval(load, 30_000);
    const c = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, [mint]);

  if (data === undefined) return <div className="text-slate-400">Loading…</div>;
  if (data === null)
    return (
      <div className="card p-8 text-center">
        <div className="text-ember">{err || "Could not load token"}</div>
        <div className="mt-4">
          <TokenSearch />
        </div>
      </div>
    );

  const symbol = data.symbol || shortAddr(data.mint);
  const apiUrl = `/api/locks/${data.mint}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {data.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.image} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="h-14 w-14 rounded-full bg-ink-600" />
          )}
          <div className="min-w-0">
            <p className="eyebrow mb-2">Public conviction</p>
            <h1 className="font-display text-4xl uppercase">
              {symbol} <span className="text-base font-medium text-slate-400">{data.name}</span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <a className="break-all font-mono text-slate-400 underline" href={EXPLORER(data.mint)} target="_blank" rel="noreferrer">
                {data.mint}
              </a>
              {data.pump?.isHolderReward && <span className="badge bg-acid/15 text-acid">✦ Holder Rewards</span>}
              {data.pump?.isPump && !data.pump.isHolderReward && (
                <span className="badge bg-ink-600 text-slate-300">pump.fun</span>
              )}
              {data.pump?.graduated && <span className="badge bg-ink-600 text-slate-300">graduated</span>}
              {data.pump?.isHolderReward && (
                <span className="badge bg-ink-600 text-slate-300" title="Asset pump.fun pays holder rewards in">
                  rewards paid in {data.rewardAsset ? data.rewardAsset.symbol || shortAddr(data.rewardAsset.mint) : "SOL"}
                </span>
              )}
            </div>
          </div>
        </div>
        <TokenSearch compact />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Locked" value={`${data.totalLocked} ${symbol}`} />
        <Stat label="% of supply" value={data.percentOfSupply === null ? "—" : `${data.percentOfSupply.toFixed(2)}%`} />
        <Stat label="Active locks" value={`${data.activeLockCount} (${data.uniqueLockers} wallets)`} />
        <Stat
          label="Next unlock"
          value={data.nextUnlockTs ? countdown(data.nextUnlockTs, now) : "—"}
          sub={data.nextUnlockTs ? formatDate(data.nextUnlockTs) : undefined}
        />
      </div>

      {data.boostPool && (
        <div className={`card p-4 ${data.boostPool.active ? "border-acid/40" : ""}`}>
          <div className="font-semibold">
            ◇ Reward boost: +{data.boostPool.bonusBps / 100}% for locks ≥ {durationLabel(data.boostPool.minDurationSeconds)}
            {!data.boostPool.active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
          </div>
          <div className="mt-1 grid gap-x-6 gap-y-1 text-sm text-slate-300 sm:grid-cols-3">
            <span>
              Enrolled: {formatUnits(data.boostPool.enrolledRaw, data.decimals, 0)} / {formatUnits(data.boostPool.capacityRaw, data.decimals, 0)}
            </span>
            <span>Pool balance: {lamportsToSol(data.boostPool.balanceLamports, 3)} SOL</span>
            <span>Bonus paid: {lamportsToSol(BigInt(data.boostPool.totalBonusPaidLamports), 3)} SOL</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Locks</h2>
          <span className="text-xs text-slate-500">
            {lamportsToSol(BigInt(data.totalSolRewardsClaimedLamports), 3)} SOL rewards claimed by lockers so far
          </span>
        </div>
        {data.locks.length === 0 ? (
          <div className="px-4 pb-6 text-center text-slate-400">
            Nothing locked yet.{" "}
            <Link href="/" className="underline">
              Be the first
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-950/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">Unlocks</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Lock</th>
                </tr>
              </thead>
              <tbody>
                {data.locks.map((l) => {
                  const unlocked = now >= l.unlockTs;
                  return (
                    <tr key={l.address} className="border-t border-ink-700/60">
                      <td className="px-4 py-2 font-mono">
                        {l.amount} {symbol}
                        {l.boostedAmountRaw !== "0" && <span className="ml-1 text-xs text-ember">🔥</span>}
                      </td>
                      <td className="px-4 py-2">
                        <a className="underline" href={EXPLORER(l.owner)} target="_blank" rel="noreferrer">
                          {shortAddr(l.owner)}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        {formatDate(l.unlockTs)}
                        {!l.withdrawn && !unlocked && (
                          <span className="ml-2 text-xs text-slate-400">in {countdown(l.unlockTs, now)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {l.withdrawn ? (
                          <span className="badge bg-ink-600 text-slate-300">withdrawn</span>
                        ) : unlocked ? (
                          <span className="badge bg-ink-600 text-slate-300">unlocked</span>
                        ) : (
                          <span className="badge bg-acid/15 text-acid">locked</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Link className="underline" href={`/lock/${l.address}`}>
                          {shortAddr(l.address)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Raw data for bots and terminals:{" "}
        <a className="font-mono underline" href={apiUrl} target="_blank" rel="noreferrer">
          GET {apiUrl}
        </a>{" "}
        (JSON, CORS enabled, refreshes every ~20s).
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="truncate font-mono text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
