"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@/lib/constants";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const links = [
  { href: "/", label: "Lock" },
  { href: "/locks", label: "My locks" },
  { href: "/how-it-works", label: "How it works" },
];

const TokenSearch = dynamic(() => import("./TokenSearch"), { ssr: false });

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-acid font-black text-ink-950">
            🔒
          </span>
          <span className="text-lg font-bold tracking-tight">{SITE_NAME}</span>
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                path === l.href ? "bg-ink-700 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block">
          <TokenSearch compact />
        </div>
        <WalletMultiButton />
      </div>
      <div className="px-4 pb-2 md:hidden">
        <TokenSearch compact />
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              path === l.href ? "bg-ink-700 text-white" : "text-slate-300"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
