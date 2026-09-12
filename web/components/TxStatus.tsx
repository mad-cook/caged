"use client";

import { EXPLORER } from "@/lib/constants";
import type { TxState } from "@/hooks/useSendTx";

export default function TxStatus({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) {
  if (state.status === "idle") return null;
  const base = "mt-3 rounded-xl border px-3 py-2 text-sm";
  if (state.status === "signing")
    return <div className={`${base} border-ink-600 text-slate-300`}>Waiting for wallet signature…</div>;
  if (state.status === "confirming")
    return (
      <div className={`${base} border-ink-600 text-slate-300`}>
        Confirming…{" "}
        <a className="underline" href={EXPLORER(state.sig, "tx")} target="_blank" rel="noreferrer">
          view
        </a>
      </div>
    );
  if (state.status === "done")
    return (
      <div className={`${base} border-acid/40 bg-acid/10 text-acid-soft`}>
        Confirmed ✓{" "}
        <a className="underline" href={EXPLORER(state.sig, "tx")} target="_blank" rel="noreferrer">
          view transaction
        </a>
        {onDismiss && (
          <button className="ml-3 text-xs text-slate-400 underline" onClick={onDismiss}>
            dismiss
          </button>
        )}
      </div>
    );
  return (
    <div className={`${base} border-ember/40 bg-ember/10 text-ember`}>
      {state.error}
      {onDismiss && (
        <button className="ml-3 text-xs text-slate-400 underline" onClick={onDismiss}>
          dismiss
        </button>
      )}
    </div>
  );
}
