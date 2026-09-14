"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import TokenPicker from "./TokenPicker";
import TxStatus from "./TxStatus";
import BrandMark from "./BrandMark";
import WalletButton from "./WalletButton";
import { useProgram } from "@/hooks/useProgram";
import { useSendTx } from "@/hooks/useSendTx";
import { WalletToken, fetchTokenMeta } from "@/lib/tokens";
import { QuoteAssetInfo, inspectQuoteAsset } from "@/lib/hooks";
import { useConnection } from "@solana/wallet-adapter-react";
import { BoostPoolAccount, ConfigAccount, createLockCustodialIx, createLockIx, fetchBoostPool, fetchConfig } from "@/lib/program";
import { formatUnits, formatUnitsPlain, lamportsToSol, parseUnits, toDatetimeLocal, durationLabel } from "@/lib/format";
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
  const [boostAssetSymbol, setBoostAssetSymbol] = useState<string>("SOL");
  const [quoteInfo, setQuoteInfo] = useState<QuoteAssetInfo | null>(null);
  const [quoteSymbol, setQuoteSymbol] = useState<string>("");
  const { connection } = useConnection();
  const [created, setCreated] = useState<{ lock: string; sig: string } | null>(null);
  /** custody mode: holder key held by Caged so pump.fun pays the lock; false = trustless PDA, no rewards */
  const [custodial, setCustodial] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchConfig(program).then(setConfig).catch(() => setConfig(null));
  }, [program]);

  useEffect(() => {
    if (!token) return setBoost(null);
    fetchBoostPool(program, new PublicKey(token.mint))
      .then(async (b) => {
        setBoost(b);
        if (b && !b.rewardMint.equals(PublicKey.default)) {
          const m = await fetchTokenMeta([b.rewardMint.toBase58()]);
          setBoostAssetSymbol(m.get(b.rewardMint.toBase58())?.symbol || b.rewardMint.toBase58().slice(0, 4));
        } else setBoostAssetSymbol("SOL");
      })
      .catch(() => setBoost(null));
    setQuoteInfo(null);
    setQuoteSymbol("");
    if (token.pump.isHolderReward && token.pump.quoteMint) {
      const q = new PublicKey(token.pump.quoteMint);
      inspectQuoteAsset(connection, q).then(setQuoteInfo).catch(() => null);
      fetchTokenMeta([q.toBase58()]).then((m) => setQuoteSymbol(m.get(q.toBase58())?.symbol || "")).catch(() => null);
    }
  }, [program, token, connection]);

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
    const params = {
      owner: publicKey,
      mint: new PublicKey(token.mint),
      tokenProgram: new PublicKey(token.tokenProgram),
      amount: new BN(rawAmount.toString()),
      unlockTs,
      treasury: config.treasury,
      boostPool: boost ? boost.publicKey : null,
    };
    const { ix, lock } = custodial ? await createLockCustodialIx(program, params) : await createLockIx(program, params);
    const sig = await send([ix], custodial ? lock : undefined);
    if (sig) {
      setCreated({ lock: lock.toBase58(), sig });
      setAmount("");
      setRefreshKey((k) => k + 1);
      setToken(null);
    }
  }

  return (
    <div className="card lock-form min-w-0 p-5 sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-ink-700 pb-5">
        <div><p className="eyebrow mb-2">Make your move</p><h2 className="font-display text-3xl uppercase">Create a lock</h2></div>
        <BrandMark className="h-12 w-11" />
      </div>

      <div className="space-y-4">
        <div>
          <div className="label">01 / Select your token</div>
          <TokenPicker value={token} onChange={setToken} refreshKey={refreshKey} />
          {token && token.pump.launchpad === "stonk" && (
            <p className="mt-2 text-xs text-slate-400">
              stonk.fun coin: a permanent {(token.pump.feeBps ?? 0) / 100}% transfer tax is charged on every transfer, so it applies once when locking and
              once when withdrawing. Holder rewards are paid in {quoteSymbol || "the paired asset"} and reach the lock only in Caged custody mode.
            </p>
          )}
          {token && !token.pump.isHolderReward && (
            <p className="mt-2 text-xs text-slate-400">
              This is not a pump.fun Holder Rewards coin. You can still lock it, but it will not earn holder
              distributions.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="lock-amount" className="label">02 / Amount to lock</label>
            {token && (
              <button
                type="button"
                className="mb-1.5 text-xs text-acid hover:underline"
                onClick={() => setAmount(formatUnitsPlain(token.rawAmount, token.decimals))}
              >
                Max {formatUnits(token.rawAmount, token.decimals)}
              </button>
            )}
          </div>
          <input
            id="lock-amount"
            className="input font-mono"
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="lock-unlock-time" className="label">03 / Unlock date &amp; time (your local time)</label>
          <input
            id="lock-unlock-time"
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
                className="min-h-11 rounded-lg border border-ink-600 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-acid/60 hover:bg-acid/5"
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
              ◇ Reward boost: +{boost.bonusBps / 100}% for locks ≥ {durationLabel(boost.minDuration.toNumber())}, paid in {boostAssetSymbol}
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

        {quoteInfo && (
          <div className={`rounded-xl border px-3 py-2.5 text-xs ${quoteInfo.restricted ? "border-ember/50 bg-ember/10 text-ember" : "border-ink-600 bg-ink-800/60 text-slate-300"}`}>
            <div className="font-semibold">Rewards for this coin are paid in {quoteSymbol || quoteInfo.mint.slice(0, 6)}</div>
            {quoteInfo.restricted ? (
              <div className="mt-1">Warning: {quoteInfo.reasons.join("; ")}. Distributions may not reach any locker, including this one.</div>
            ) : quoteInfo.issuerControls.length > 0 ? (
              <div className="mt-1 text-slate-400">Issuer-controlled asset: {quoteInfo.issuerControls.join(", ")}. Claims work today; the issuer could change that.</div>
            ) : null}
          </div>
        )}

        <div className={`rounded-xl border p-3 text-xs transition-colors ${custodial ? "border-acid/60 bg-acid/10" : "border-ink-600 bg-ink-800/60"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-100">
              Holder rewards: <span className={custodial ? "text-acid" : "text-ember"}>{custodial ? "ON · Caged custody" : "OFF · trustless"}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={custodial}
              onClick={() => setCustodial((v) => !v)}
              className={`relative h-7 w-14 shrink-0 rounded-full border transition-colors ${custodial ? "border-acid bg-acid" : "border-ink-500 bg-ink-700"}`}
              title={custodial ? "Switch to a trustless lock (no holder rewards)" : "Switch to Caged custody (earns holder rewards)"}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-ink-950 shadow transition-all ${custodial ? "left-7" : "left-0.5"}`} />
              <span className={`absolute inset-0 flex items-center text-[9px] font-bold ${custodial ? "justify-start pl-2 text-ink-950" : "justify-end pr-2 text-slate-300"}`}>{custodial ? "ON" : "OFF"}</span>
            </button>
          </div>
          <p className="mt-2 text-slate-400">
            {custodial
              ? "pump.fun only pays rewards to ordinary wallet addresses, never to program vaults. Your lock's holder address will be a real key held by Caged's signing service, so distributions reach it. The unlock date, owner and fees are enforced by the on-chain program, but you are trusting Caged not to move locked tokens early."
              : "Fully trustless: the vault is owned by a program address nobody controls. pump.fun does not pay holder rewards to program addresses, so this lock earns nothing. You can migrate it into Caged custody later."}
          </p>
        </div>

        <div className="fee-summary">
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

        {!publicKey ? <div className="flex justify-center rounded-xl border border-ink-700 bg-ink-950/30 p-4"><WalletButton /></div> : <button className="btn-primary w-full" disabled={problems.length > 0 || busy} onClick={submit}>
          {busy ? "Locking…" : problems[0] ?? `Lock ${token?.symbol ?? "tokens"}`}
        </button>}
        <p className="text-center text-[11px] leading-relaxed text-slate-500">Your tokens cannot be withdrawn before the unlock time. Eligible rewards can be claimed separately.</p>

        <TxStatus state={state} onDismiss={reset} />

        {created && (
          <div className="rounded-xl border border-acid/40 bg-acid/10 p-3 text-sm">
            <div className="font-semibold text-acid-soft">Conviction confirmed. Lock created.</div>
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
