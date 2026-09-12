"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import TxStatus from "./TxStatus";
import { PumpBadge } from "./TokenPicker";
import { useProgram } from "@/hooks/useProgram";
import { useSendTx } from "@/hooks/useSendTx";
import {
  BoostPoolAccount,
  ConfigAccount,
  LockAccount,
  TokenReward,
  claimSolRewardsIx,
  claimTokenRewardsIx,
  closeLockIx,
  extendLockIx,
  fetchBoostPool,
  fetchClaimableSol,
  fetchTokenRewards,
  topUpIx,
  withdrawIx,
} from "@/lib/program";
import { TokenMeta, fetchTokenMeta } from "@/lib/tokens";
import { PumpStatus, getPumpStatuses } from "@/lib/pump";
import { countdown, formatDate, formatUnits, lamportsToSol, parseUnits, shortAddr, toDatetimeLocal } from "@/lib/format";
import { EXPLORER } from "@/lib/constants";

export default function LockCard({
  lock,
  config,
  onChanged,
  readOnly = false,
}: {
  lock: LockAccount;
  config: ConfigAccount | null;
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const { connection } = useConnection();
  const program = useProgram();
  const { send, state, reset, busy } = useSendTx();

  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [pump, setPump] = useState<PumpStatus | null>(null);
  const [claimable, setClaimable] = useState<number>(0);
  const [tokenRewards, setTokenRewards] = useState<TokenReward[]>([]);
  const [boost, setBoost] = useState<BoostPoolAccount | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const [panel, setPanel] = useState<"none" | "extend" | "topup">("none");
  const [extendLocal, setExtendLocal] = useState(() => toDatetimeLocal(lock.unlockTs.toNumber() + 30 * 86400));
  const [topUpAmount, setTopUpAmount] = useState("");

  const decimals = meta?.decimals ?? 6;
  const unlockTs = lock.unlockTs.toNumber();
  const unlocked = now >= unlockTs;

  const refresh = useCallback(async () => {
    const [c, tr, b] = await Promise.all([
      fetchClaimableSol(connection, lock.vaultAuthority),
      fetchTokenRewards(connection, lock.vaultAuthority, lock.mint).catch(() => []),
      fetchBoostPool(program, lock.mint).catch(() => null),
    ]);
    setClaimable(c);
    setTokenRewards(tr);
    setBoost(b);
  }, [connection, program, lock]);

  useEffect(() => {
    fetchTokenMeta([lock.mint.toBase58()]).then((m) => setMeta(m.get(lock.mint.toBase58()) ?? null));
    getPumpStatuses(connection, [lock.mint]).then((m) => setPump(m.get(lock.mint.toBase58()) ?? null));
    refresh();
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    const id2 = setInterval(refresh, 30_000);
    return () => {
      clearInterval(id);
      clearInterval(id2);
    };
  }, [connection, lock, refresh]);

  const treasury = config?.treasury;
  const boostPk = boost ? boost.publicKey : null;

  async function run(build: () => Promise<any>) {
    const ix = await build();
    const sig = await send([ix]);
    if (sig) {
      await refresh();
      onChanged?.();
    }
  }

  const feePct = config ? config.rewardFeeBps / 100 : 2;
  const netClaim = claimable - Math.floor((claimable * (config?.rewardFeeBps ?? 200)) / 10_000);
  const boostedShare =
    lock.amount.isZero() || lock.boostedAmount.isZero() ? 0 : lock.boostedAmount.toNumber() / lock.amount.toNumber();
  const estBonus = boost && boost.active && boostedShare > 0 ? Math.floor((netClaim * lock.bonusBps * boostedShare) / 10_000) : 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {meta?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.image} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="h-10 w-10 rounded-full bg-ink-600" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{meta?.symbol ?? shortAddr(lock.mint.toBase58())}</span>
              {pump && <PumpBadge t={{ pump }} />}
              {!lock.boostedAmount.isZero() && (
                <span className="badge bg-ember/15 text-ember">🔥 +{lock.bonusBps / 100}% boost</span>
              )}
              {lock.withdrawn && <span className="badge bg-ink-600 text-slate-300">withdrawn</span>}
            </div>
            <div className="text-xs text-slate-400">{meta?.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold">
            {formatUnits(lock.amount, decimals)} <span className="text-sm text-slate-400">{meta?.symbol}</span>
          </div>
          <div className={`text-sm ${unlocked ? "text-acid" : "text-slate-300"}`}>
            {lock.withdrawn ? "—" : unlocked ? "Unlocked" : `Unlocks in ${countdown(unlockTs, now)}`}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Unlock time</dt>
          <dd>{formatDate(unlockTs)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Created</dt>
          <dd>{formatDate(lock.createdTs.toNumber())}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Claimable rewards</dt>
          <dd className="font-mono text-acid">{lamportsToSol(claimable, 5)} SOL</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Claimed so far</dt>
          <dd className="font-mono">
            {lamportsToSol(lock.solRewardsClaimed, 5)} SOL
            {!lock.bonusPaid.isZero() && (
              <span className="text-xs text-ember"> +{lamportsToSol(lock.bonusPaid, 5)} bonus</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          Lock:{" "}
          <Link className="underline" href={`/lock/${lock.publicKey.toBase58()}`}>
            {shortAddr(lock.publicKey.toBase58())}
          </Link>
        </span>
        <span>
          Holder address:{" "}
          <a className="underline" href={EXPLORER(lock.vaultAuthority.toBase58())} target="_blank" rel="noreferrer">
            {shortAddr(lock.vaultAuthority.toBase58())}
          </a>
        </span>
        <span>
          Owner:{" "}
          <a className="underline" href={EXPLORER(lock.owner.toBase58())} target="_blank" rel="noreferrer">
            {shortAddr(lock.owner.toBase58())}
          </a>
        </span>
      </div>

      {tokenRewards.length > 0 && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-950/60 p-3 text-sm">
          <div className="mb-1 text-xs text-slate-400">Token rewards sitting on this lock</div>
          {tokenRewards.map((r) => (
            <div key={r.account.toBase58()} className="flex items-center justify-between py-1">
              <span className="font-mono">
                {formatUnits(r.rawAmount, r.decimals, 4)} <span className="text-slate-400">{shortAddr(r.mint.toBase58())}</span>
              </span>
              {!readOnly && treasury && (
                <button
                  className="btn-ghost !px-3 !py-1 text-xs"
                  disabled={busy}
                  onClick={() => run(() => claimTokenRewardsIx(program, lock, treasury, r))}
                >
                  Claim
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={busy || claimable <= 0 || !treasury}
              onClick={() => run(() => claimSolRewardsIx(program, lock, treasury!, boostPk))}
              title={`You receive ${lamportsToSol(netClaim, 5)} SOL after the ${feePct}% fee${
                estBonus > 0 ? ` + ~${lamportsToSol(estBonus, 5)} SOL boost bonus` : ""
              }`}
            >
              Claim {lamportsToSol(netClaim, 4)} SOL
              {estBonus > 0 && <span className="text-ember">+{lamportsToSol(estBonus, 4)}</span>}
            </button>
            {!lock.withdrawn && (
              <>
                <button
                  className="btn-ghost"
                  disabled={busy || !unlocked}
                  onClick={() => run(() => withdrawIx(program, lock, boostPk))}
                  title={unlocked ? "Return locked tokens to your wallet" : "Not unlocked yet"}
                >
                  Withdraw
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => setPanel(panel === "extend" ? "none" : "extend")}>
                  Extend
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => setPanel(panel === "topup" ? "none" : "topup")}>
                  Top up
                </button>
              </>
            )}
            {lock.withdrawn && treasury && (
              <button className="btn-danger" disabled={busy} onClick={() => run(() => closeLockIx(program, lock, treasury))}>
                Close &amp; reclaim rent
              </button>
            )}
          </div>

          {panel === "extend" && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <label className="label">New unlock time</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={extendLocal}
                  min={toDatetimeLocal(unlockTs + 60)}
                  onChange={(e) => setExtendLocal(e.target.value)}
                />
              </div>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  const ts = Math.floor(new Date(extendLocal).getTime() / 1000);
                  if (!(ts > unlockTs)) return;
                  run(() => extendLockIx(program, lock, ts)).then(() => setPanel("none"));
                }}
              >
                Confirm extend
              </button>
            </div>
          )}

          {panel === "topup" && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <label className="label">Amount to add</label>
                <input
                  className="input font-mono"
                  placeholder="0.00"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                />
              </div>
              <button
                className="btn-primary"
                disabled={busy || !topUpAmount}
                onClick={() => {
                  let raw: bigint;
                  try {
                    raw = parseUnits(topUpAmount, decimals);
                  } catch {
                    return;
                  }
                  if (raw <= 0n) return;
                  run(() => topUpIx(program, lock, new BN(raw.toString()), boostPk)).then(() => {
                    setPanel("none");
                    setTopUpAmount("");
                  });
                }}
              >
                Confirm top up
              </button>
            </div>
          )}

          <TxStatus state={state} onDismiss={reset} />
        </>
      )}
    </div>
  );
}
