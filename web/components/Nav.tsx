"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@/lib/constants";
import BrandMark from "./BrandMark";
import WalletButton from "./WalletButton";

const links = [
  { href: "/", label: "Create a lock" },
  { href: "/locks", label: "My locks" },
  { href: "/how-it-works", label: "How it works" },
];
const TokenSearch = dynamic(() => import("./TokenSearch"), { ssr: false });

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/95 backdrop-blur-xl">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-acid focus:p-3 focus:text-ink-950">Skip to content</a>
      <div className="site-container flex min-h-[84px] items-center justify-between gap-4">
        <Link href="/" aria-label={SITE_NAME + " home"} className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <BrandMark className="h-11 w-10 sm:h-12 sm:w-11" />
          <span className="brand-wordmark">CAGED<br />DIAMOND BALLS</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className={"nav-link " + (path === l.href ? "nav-link-active" : "")}>{l.label}</Link>)}
        </nav>
        <div className="hidden max-w-[245px] flex-1 xl:block"><TokenSearch compact /></div>
        <WalletButton />
      </div>
      <nav aria-label="Mobile navigation" className="site-container mobile-nav flex gap-1 pb-2 lg:hidden">
        {links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className={"nav-link " + (path === l.href ? "nav-link-active" : "")}>{l.label}</Link>)}
      </nav>
    </header>
  );
}
