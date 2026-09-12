import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import Nav from "@/components/Nav";
import BrandMark from "@/components/BrandMark";
import { GITHUB_URL, SITE_NAME, X_URL } from "@/lib/constants";

const bodyFont = localFont({ src: "../public/fonts/Inter-Variable.ttf", variable: "--font-body", display: "swap" });
const displayFont = localFont({ src: "../public/fonts/BarlowCondensed-ExtraBold.ttf", variable: "--font-display", weight: "800", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3050")),
  title: SITE_NAME + " | $CAGED — Show your conviction",
  description: "Show your conviction. Lock your tokens and keep claiming eligible holder rewards with Caged Diamond Balls. Diamond balls. On lock.",
  icons: { icon: "/brand/icon.svg", apple: "/brand/apple-touch-icon.png" },
  openGraph: { title: SITE_NAME + " · $CAGED", description: "Show your conviction. Lock your tokens. Keep claiming eligible holder rewards.", images: [{ url: "/brand/social-banner.jpg", width: 1500, height: 500, alt: "Caged Diamond Balls — $CAGED" }] },
  twitter: { card: "summary_large_image", title: SITE_NAME + " · $CAGED", images: ["/brand/social-banner.jpg"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={bodyFont.variable + " " + displayFont.variable + " font-sans antialiased"}>
        <Providers>
          <Nav />
          <main id="main-content" className="site-container min-h-[60vh] py-8 sm:py-10">{children}</main>
          <footer className="mt-8 border-t border-ink-700 text-xs text-slate-500">
            <div className="site-container py-9 sm:py-12">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <Link href="/" className="flex items-center gap-3 text-slate-200"><BrandMark className="h-10 w-9" /><span className="brand-wordmark">CAGED DIAMOND BALLS<span className="mt-2 block font-sans text-[9px] font-medium tracking-[.2em] text-slate-500">DIAMOND BALLS. ON LOCK.</span></span></Link>
                <div className="flex flex-wrap items-center gap-5">
                  <a className="hover:text-white" href={X_URL} target="_blank" rel="noreferrer">X / @cagedballs</a>
                  <a className="hover:text-white" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
                  <a className="hover:text-white" href="/api/stats" target="_blank" rel="noreferrer">API</a>
                  <Link className="hover:text-white" href="/how-it-works#api">API docs</Link>
                </div>
              </div>
              <p className="mt-7 max-w-3xl leading-relaxed">Locks are enforced on-chain. Rewards depend on pump.fun&apos;s eligibility and distribution rules. Review the unlock time and fees before confirming a lock.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
