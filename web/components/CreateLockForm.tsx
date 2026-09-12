"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import TokenPicker from "./TokenPicker";
import TxStatus from "./TxStatus";
import { useProgram } from "@/hooks/useProgram";
import { useSendTx } from "@/hooks/useSendTx";
import { WalletToken } from "@/lib/tokens";
import { BoostPoolAccount, ConfigAccount, createLockIx, fetchBoostPool, fetchConfig } from "@/lib/program";
import { formatUnits, lamportsToSol, parseUnits, toDatetimeLocal, durationLabel } from "@/lib/format";
import { EXPLORER } from "@/lib/constants";

const PRESETS = [
  { label: "7 days", s: 7 * 86400 },
  { label: "30 days", s: 30 * 86400 },
  { label: "90 days", s: 90 * 86400 },
  { label: "180 days", s: 180 * 86400 },
  { label: "1 year", s: 365 * 86400 },
];

// Roughly: lock account rent + vault ATA rent + vault authority reserve.
const EST_RENT_LAMPORTS = 2_200_000 + 2_040_000 + 890_880;

export default function CreateLockForm() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { send, state, reset, busy } = useSendTx();

  const [token, setToken] = useState<WalletToken | null>(null);
  const [amount, setAmount] = useState("");
  const [unlockLocal, setUnlockLocal] = useState(() => toDatetimeLocal(Math.floor(Date.now() / 1000) + 30 * 86400));
  const [config, setConfig] = useState<ConfigAccount | null>(null);
  const [boost, setBoost] = useState<BoostPoolAccount | null>(null);
  const [created, setCreated] = useState<{ lock: string; sig: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchConfig(program).then(setConfig).catch(() => setConfig(null));
  }, [program]);

  useEffect(() => {
    if (!token) return setBoost(null);
    fetchBoostPool(program, new PublicKey(token.mint)).then(setBoost).catch(() => setBoost(null));
  }, [program, token]);

  const unlockTs = useMemo(() => Math.floor(new Date(unlockLocal).getTime() / 1000), [unlockLocal]);
  const nowTs = Math.floor(Date.now() / 1000);
  const duration = unlockTs - nowTs;

  const rawAmount = useMemo(() => {
    if (!token || !amount) return null;
    try {
      return parseUnits(amount, token.decimals);
    } catch {
      return null;
    }
  }, [amount, token]);

  const boostEligible =
    !!boost && boost.active && duration >= boost.minDuration.toNumber() && boost.enrolled.lt(boost.capacity);
  const boostRoom = boost ? BigInt(boost.capacity.sub(boost.enrolled).toString()) : 0n;

  const problems: string[] = [];
  if (!publicKey) problems.push("Connect a wallet");
  if (!token) problems.push("Pick a token");
  if (token && !rawAmount) problems.push("Enter a valid amount");
  if (token && rawAmount && rawAmount <= 0n) problems.push("Amount must be > 0");
  if (token && rawAmount && rawAmount > token.rawAmount) problems.push("Amount exceeds your balance");
  if (!Number.isFinite(unlockTs) || unlockTs <= nowTs + 60) problems.push("Unlock time must be in the future");
  if (config?.paused) problems.push("Locking is paused");
  if (!config) problems.push("Program not initialized on this cluster");

  async function submit() {
    if (!publicKey || !token || !rawAmount || !config) return;
    setCreated(null);
    const { ix, lock } = await createLockIx(program, {
      owner: publicKey,
      mint: new PublicKey(token.mint),
      tokenProgram: new PublicKey(token.tokenProgram),
      amount: new BN(rawAmount.toString()),
      unlockTs,
      treasury: config.treasury,
      boostPool: boost ? boost.publicKey : null,
    });
    const sig = await send([ix]);
    if (sig) {
      setCreated({ lock: lock.toBase58(), sig });
      setAmount("");
      setRefreshKey((k) => k + 1);
      setToken(null);
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold">Create a lock</h2>

      <div className="space-y-4">
        <div>
          <label className="label">Token</label>
          <TokenPicker value={token} onChange={setToken} refreshKey={refreshKey} />
          {token && !token.pump.isHolderReward && (
            <p className="mt-2 text-xs text-slate-400">
              This is not a pump.fun Holder Rewards coin. You can still lock it, but it will not earn holder
              distributions.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label">Amount</label>
            {token && (
              <button
                type="button"
                className="mb-1.5 text-xs text-acid hover:underline"
                onClick={() => setAmount(formatUnits(token.rawAmount, token.decimals, token.decimals))}
              >
                Max {formatUnits(token.rawAmount, token.decimals)}
              </button>
            )}
          </div>
          <input
            className="input font-mono"
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Unlock date &amp; time (your local time)</label>
          <input
            type="datetime-local"
            className="input"
            value={unlockLocal}
            min={toDatetimeLocal(nowTs + 600)}
            onChange={(e) => setUnlockLocal(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.s}
                type="button"
                className="rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-slate-300 hover:border-acid/60"
                onClick={() => setUnlockLocal(toDatetimeLocal(Math.floor(Date.now() / 1000) + p.s))}
              >
                {p.label}
              </button>
            ))}
          </div>
          {duration > 0 && (
            <p className="mt-1.5 text-xs text-slate-400">Locked for ~{durationLabel(duration)}</p>
          )}
        </div>

        {boost && (
          <div
            className={`rounded-xl border px-3 py-2.5 text-sm ${
              boostEligible ? "border-acid/50 bg-acid/10" : "border-ink-600 bg-ink-800/60"
            }`}
          >
            <div className="font-semibold">
              🔥 Boost pool: +{boost.bonusBps / 100}% rewards for locks ≥ {durationLabel(boost.minDuration.toNumber())}
            </div>
            <div className="text-xs text-slate-300">
              {boostEligible
                ? `Eligible. ${formatUnits(boostRoom, token?.decimals ?? 6, 0)} ${token?.symbol} of boosted capacity left${
                    rawAmount && rawAmount > boostRoom ? " (part of your lock will be boosted)" : ""
                  }.`
                : boost.enrolled.gte(boost.capacity)
                  ? "Boost capacity is full."
                  : `Lock for at least ${durationLabel(boost.minDuration.toNumber())} to qualify.`}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-ink-700 bg-ink-950/60 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Lock creation fee</span>
            <span className="font-mono">{config ? lamportsToSol(config.lockFeeLamports) : "—"} SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Account rent (refundable on close)</span>
            <span className="font-mono">~{lamportsToSol(EST_RENT_LAMPORTS, 4)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Fee on claimed rewards</span>
            <span className="font-mono">{config ? config.rewardFeeBps / 100 : "—"}%</span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Plus normal Solana network fees</span>
          </div>
        </div>

        <button className="btn-primary w-full" disabled={problems.length > 0 || busy} onClick={submit}>
          {busy ? "Locking…" : problems[0] ?? `Lock ${token?.symbol ?? "tokens"}`}
        </button>

        <TxStatus state={state} onDismiss={reset} />

        {created && (
          <div className="rounded-xl border border-acid/40 bg-acid/10 p-3 text-sm">
            <div className="font-semibold text-acid-soft">Lock created 🎉</div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              <Link className="underline" href={`/lock/${created.lock}`}>
                Public lock page
              </Link>
              <Link className="underline" href="/locks">
                My locks
              </Link>
              <a className="underline" href={EXPLORER(created.sig, "tx")} target="_blank" rel="noreferrer">
                Transaction
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
