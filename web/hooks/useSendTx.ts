"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { buildTx, explainError } from "@/lib/program";

export type TxState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "confirming"; sig: string }
  | { status: "done"; sig: string }
  | { status: "error"; error: string };

export function useSendTx() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const [state, setState] = useState<TxState>({ status: "idle" });

  /**
   * Send a transaction. When `coSignLock` is given, the transaction is first
   * co-signed by the Caged custody service with that lock's holder key, then
   * signed by the wallet.
   */
  const send = useCallback(
    async (ixs: TransactionInstruction[], coSignLock?: PublicKey): Promise<string | null> => {
      if (!publicKey) {
        setState({ status: "error", error: "Connect a wallet first" });
        return null;
      }
      try {
        setState({ status: "signing" });
        let tx: Transaction = buildTx(publicKey, ixs);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;

        let sig: string;
        if (coSignLock) {
          if (!signTransaction) throw new Error("Wallet cannot sign transactions");
          const res = await fetch("/api/custody/sign", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lock: coSignLock.toBase58(),
              tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
            }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Custody service refused to sign");
          tx = Transaction.from(Buffer.from(j.tx, "base64"));
          const signed = await signTransaction(tx);
          sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
        } else {
          sig = await sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 });
        }
        setState({ status: "confirming", sig });
        const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
        setState({ status: "done", sig });
        return sig;
      } catch (e) {
        setState({ status: "error", error: explainError(e) });
        return null;
      }
    },
    [connection, publicKey, sendTransaction, signTransaction],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { send, state, reset, busy: state.status === "signing" || state.status === "confirming" };
}
