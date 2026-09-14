"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import TxStatus from "./TxStatus";
import { PumpBadge } from "./TokenPicker";
import CopyAddress from "./CopyAddress";
import { useProgram } from "@/hooks/useProgram";
import { useSendTx } from "@/hooks/useSendTx";
import {
  BoostPoolAccount,
  poolPaysSol,
  ConfigAccount,
  LockAccount,
  TokenReward,
  claimSolRewardsCustodialIx,
  claimSolRewardsIx,
  claimTokenRewardsCustodialIx,
  claimTokenRewardsIx,
  closeLockCustodialIx,
  closeLockIx,
  extendLockIx,
  fetchBoostPool,
  isCustodial,
  migrateLockIx,
  withdrawCustodialIx,
  fetchClaimableSol,
  fetchTokenRewards,
  topUpIx,
  withdrawIx,
} from "@/lib/program";
import { TokenMeta, fetchTokenMeta } from "@/lib/tokens";
import { PumpStatus, getLaunchStatuses } from "@/lib/pump";
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
  /** metadata for reward mints + the coin's quote mint, keyed by mint */
  const [rewardMeta, setRewardMeta] = useState<Map<string, TokenMeta>>(new Map());
  const [boost, setBoost] = useState<BoostPoolAccount | null>(null);
  /** what the vault really holds; differs from lock.amount for transfer-tax tokens */
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null);
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
    if (!lock.withdrawn) {
      connection
        .getTokenAccountBalance(getAssociatedTokenAddressSync(lock.mint, lock.vaultAuthority, true, lock.tokenProgram), "confirmed")
        .then((v) => setVaultBalance(BigInt(v.value.amount)))
        .catch(() => setVaultBalance(null));
    }
    if (tr.length) {
      const mints = tr.map((r) => r.mint.toBase58());
      fetchTokenMeta(mints).then((m) => setRewardMeta((prev) => new Map([...prev, ...m]))).catch(() => null);
    }
  }, [connection, program, lock]);

  useEffect(() => {
    fetchTokenMeta([lock.mint.toBase58()]).then((m) => setMeta(m.get(lock.mint.toBase58()) ?? null));
    getLaunchStatuses(connection, [lock.mint]).then((m) => {
      const p = m.get(lock.mint.toBase58()) ?? null;
      setPump(p);
      if (p?.quoteMint) {
        fetchTokenMeta([p.quoteMint]).then((mm) => setRewardMeta((prev) => new Map([...prev, ...mm]))).catch(() => null);
      }
    });
    refresh();
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    const id2 = setInterval(refresh, 30_000);
    return () => {
      clearInterval(id);
      clearInterval(id2);
    };
  }, [connection, lock, refresh]);

  const treasury = config?.treasury;
  const boostedShare =
    lock.amount.isZero() || lock.boostedAmount.isZero() ? 0 : lock.boostedAmount.toNumber() / lock.amount.toNumber();
  const boostPk = boost ? boost.publicKey : null;
  /** only SOL pools pay on SOL claims; token pools pay on the matching token claim */
  const solPoolPk = poolPaysSol(boost) ? boostPk : null;
  const tokenBonusEstimate = (r: TokenReward): bigint => {
    if (!boost || !boost.active || !boost.rewardMint.equals(r.mint) || boostedShare <= 0) return 0n;
    const net = r.rawAmount - (r.rawAmount * BigInt(config?.rewardFeeBps ?? 200)) / 10_000n;
    return (net * BigInt(lock.bonusBps) * BigInt(lock.boostedAmount.toString())) / (10_000n * BigInt(lock.amount.toString()));
  };

  const custodial = isCustodial(lock);
  /** custodial locks need the holder key's co-signature on value-moving instructions */
  async function run(build: () => Promise<any>, coSign = custodial) {
    const built = await build();
    const ix = built && built.ix ? built.ix : built;
    const sig = await send([ix], coSign ? lock.publicKey : undefined);
    if (sig) {
      await refresh();
      onChanged?.();
    }
  }

  const quoteMeta = pump?.quoteMint ? rewardMeta.get(pump.quoteMint) : undefined;
  const quoteLabel = pump?.quoteMint ? quoteMeta?.symbol || shortAddr(pump.quoteMint) : pump?.launchpad === "stonk" ? "the paired asset" : "SOL";
  const feePct = config ? config.rewardFeeBps / 100 : 2;
  const netClaim = claimable - Math.floor((claimable * (config?.rewardFeeBps ?? 200)) / 10_000);
  const estBonus = boost && boost.active && poolPaysSol(boost) && boostedShare > 0 ? Math.floor((netClaim * lock.bonusBps * boostedShare) / 10_000) : 0;

  return (
    <div className="card min-w-0 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {meta?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.image} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="h-10 w-10 rounded-full bg-ink-600" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{meta?.symbol ?? shortAddr(lock.mint.toBase58())}</span>
              {pump && <PumpBadge t={{ pump }} />}
              {!lock.boostedAmount.isZero() && (
                <span className="badge bg-sol/15 text-sol">◇ +{lock.bonusBps / 100}% boost</span>
              )}
              {lock.withdrawn && <span className="badge bg-ink-600 text-slate-300">withdrawn</span>}
              {custodial ? (
                <span className="badge bg-acid/15 text-acid" title="Holder key held by Caged's signing service; pump.fun pays this lock">earning · Caged custody</span>
              ) : (
                <span className="badge bg-ink-700 text-slate-400" title="Vault owned by a program address; pump.fun does not pay program addresses">trustless · no holder rewards</span>
              )}
            </div>
            <div className="text-xs text-slate-400">{meta?.name}</div>
            <div className="mt-1.5">
              <CopyAddress label="CA" address={lock.mint.toBase58()} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold">
            {formatUnits(vaultBalance ?? lock.amount, decimals)} <span className="text-sm text-slate-400">{meta?.symbol}</span>
            {vaultBalance !== null && !lock.withdrawn && vaultBalance < BigInt(lock.amount.toString()) && (
              <div className="text-[11px] font-sans font-normal text-slate-500" title="The token charges a transfer tax on every transfer, including the lock deposit">
                sent {formatUnits(lock.amount, decimals)} · tax deducted by the token
              </div>
            )}
          </div>
          <div className={`text-sm ${unlocked ? "text-acid" : "text-slate-300"}`}>
            {lock.withdrawn ? "—" : unlocked ? "Unlocked" : `Unlocks in ${countdown(unlockTs, now)}`}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-ink-700 py-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Unlock time</dt>
          <dd>{formatDate(unlockTs)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Created</dt>
          <dd>{formatDate(lock.createdTs.toNumber())}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">
            Claimable rewards
            {pump?.isHolderReward && (
              <span className="ml-1 text-slate-600" title={pump.quoteMint ? `This coin's holder rewards are paid in ${quoteLabel}` : "Paid in SOL"}>
                · paid in {quoteLabel}
              </span>
            )}
          </dt>
          <dd className="font-mono text-acid">
            {(claimable > 0 || !pump?.quoteMint) && <div>{lamportsToSol(claimable, 5)} SOL</div>}
            {tokenRewards.map((r) => {
              const rm = rewardMeta.get(r.mint.toBase58());
              return (
                <div key={r.mint.toBase58()}>
                  {formatUnits(r.rawAmount, r.decimals, 4)} {rm?.symbol || shortAddr(r.mint.toBase58())}
                </div>
              );
            })}
            {claimable === 0 && tokenRewards.length === 0 && pump?.quoteMint && <div>0 {quoteLabel}</div>}
          </dd>
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
          {tokenRewards.map((r) => {
            const rm = rewardMeta.get(r.mint.toBase58());
            return (
            <div key={r.account.toBase58()} className="flex items-center justify-between gap-3 py-1">
              <span className="flex min-w-0 items-center gap-2">
                {rm?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rm.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full bg-ink-600" />
                )}
                <span className="font-mono">
                  {formatUnits(r.rawAmount, r.decimals, 4)} <span className="font-semibold">{rm?.symbol || shortAddr(r.mint.toBase58())}</span>
                </span>
                <span className="truncate text-xs text-slate-400">{rm?.name}</span>
                <a className="text-xs text-slate-500 underline" href={EXPLORER(r.mint.toBase58())} target="_blank" rel="noreferrer">
                  {shortAddr(r.mint.toBase58())}
                </a>
              </span>
              {!readOnly && treasury && (
                <button
                  className="btn-ghost !px-3 !py-1 text-xs"
                  disabled={busy}
                  onClick={() => run(() => custodial ? claimTokenRewardsCustodialIx(program, lock, treasury, r, boost) : claimTokenRewardsIx(program, lock, treasury, r, boost))}
                  title={tokenBonusEstimate(r) > 0n ? `+ ~${formatUnits(tokenBonusEstimate(r), r.decimals, 4)} boost bonus from the pool` : undefined}
                >
                  Claim
                  {tokenBonusEstimate(r) > 0n && <span className="ml-1 text-ember">+{formatUnits(tokenBonusEstimate(r), r.decimals, 2)}</span>}
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={busy || claimable <= 0 || !treasury}
              onClick={() => run(() => custodial ? claimSolRewardsCustodialIx(program, lock, treasury!, solPoolPk) : claimSolRewardsIx(program, lock, treasury!, solPoolPk))}
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
                  onClick={() => run(() => custodial ? withdrawCustodialIx(program, lock, boostPk) : withdrawIx(program, lock, boostPk))}
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
                {!custodial && treasury && (
                  <button
                    className="btn-primary"
                    disabled={busy}
                    title="Move this lock into Caged custody so pump.fun pays it. Same owner, amount and unlock date."
                    onClick={() => {
                      if (!confirm("Migrate this lock into Caged custody? The unlock date, amount and owner stay the same. The holder key will be held by Caged's signing service so pump.fun pays holder rewards to the lock.")) return;
                      run(() => migrateLockIx(program, lock, treasury), true);
                    }}
                  >
                    Migrate → earn rewards
                  </button>
                )}
              </>
            )}
            {lock.withdrawn && treasury && (
              <button className="btn-danger" disabled={busy} onClick={() => run(() => custodial ? closeLockCustodialIx(program, lock, treasury) : closeLockIx(program, lock, treasury))}>
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
                  run(() => extendLockIx(program, lock, ts), false).then(() => setPanel("none"));
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
                  run(() => topUpIx(program, lock, new BN(raw.toString()), boostPk), false).then(() => {
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
