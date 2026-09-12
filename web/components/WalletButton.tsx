"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <button className="btn-primary text-xs" disabled>Connect wallet</button> },
);

export default function WalletButton() {
  return <WalletMultiButton />;
}
