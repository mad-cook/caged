"use client";

import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { RPC_URL } from "@/lib/constants";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  const wsEndpoint = useMemo(() => {
    try {
      const u = new URL(RPC_URL);
      u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
      return u.toString();
    } catch {
      return undefined;
    }
  }, []);

  return (
    <ConnectionProvider
      endpoint={RPC_URL}
      config={{ commitment: "confirmed", wsEndpoint, confirmTransactionInitialTimeout: 90_000 }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
