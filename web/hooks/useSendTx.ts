"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TransactionInstruction } from "@solana/web3.js";
import { buildTx, explainError } from "@/lib/program";

export type TxState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "confirming"; sig: string }
  | { status: "done"; sig: string }
  | { status: "error"; error: string };

export function useSendTx() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async (ixs: TransactionInstruction[]): Promise<string | null> => {
      if (!publicKey) {
        setState({ status: "error", error: "Connect a wallet first" });
        return null;
      }
      try {
        setState({ status: "signing" });
        const tx = buildTx(publicKey, ixs);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        const sig = await sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 });
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
    [connection, publicKey, sendTransaction],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { send, state, reset, busy: state.status === "signing" || state.status === "confirming" };
}
