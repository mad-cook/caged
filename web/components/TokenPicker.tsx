"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchWalletTokens, WalletToken } from "@/lib/tokens";
import { formatUnits, shortAddr } from "@/lib/format";

export function PumpBadge({ t }: { t: Pick<WalletToken, "pump"> }) {
  if (t.pump.isHolderReward)
    return <span className="badge bg-acid/15 text-acid">✦ Holder Rewards</span>;
  if (t.pump.isPump) return <span className="badge bg-ink-600 text-slate-300">pump.fun (no holder rewards)</span>;
  return <span className="badge bg-ink-700 text-slate-400">other token</span>;
}

export default function TokenPicker({
  value,
  onChange,
  refreshKey = 0,
}: {
  value: WalletToken | null;
  onChange: (t: WalletToken | null) => void;
  refreshKey?: number;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!publicKey) {
      setTokens([]);
      onChange(null);
      return;
    }
    setLoading(true);
    setErr(null);
    fetchWalletTokens(connection, publicKey)
      .then((t) => alive && setTokens(t))
      .catch((e) => alive && setErr(e?.message || "Failed to load tokens"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, refreshKey]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tokens;
    return tokens.filter(
      (t) => t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.mint.toLowerCase().includes(s),
    );
  }, [tokens, q]);

  if (!publicKey) return <div className="input text-slate-500">Connect a wallet to pick a token</div>;

  return (
    <div className="relative">
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        {value ? (
          <span className="flex items-center gap-2">
            {value.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.image} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span className="h-6 w-6 rounded-full bg-ink-600" />
            )}
            <span className="font-semibold">{value.symbol}</span>
            <span className="text-slate-400">{value.name}</span>
            <PumpBadge t={value} />
          </span>
        ) : (
          <span className="text-slate-500">{loading ? "Loading your tokens…" : "Select a token"}</span>
        )}
        <span className="text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
          <div className="p-2">
            <input
              autoFocus
              className="input"
              placeholder="Search by symbol, name or mint"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {err && <div className="px-3 py-2 text-sm text-ember">{err}</div>}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-500">No tokens with a balance found.</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.tokenAccount}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-800"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
              >
                {t.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="h-7 w-7 rounded-full bg-ink-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="truncate text-xs text-slate-400">{t.name}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    {shortAddr(t.mint)} <PumpBadge t={t} />
                  </span>
                </span>
                <span className="font-mono text-sm text-slate-200">{formatUnits(t.rawAmount, t.decimals)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
