import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Nav from "@/components/Nav";
import { GITHUB_URL, SITE_NAME, X_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE_NAME} — lock pump.fun coins, keep earning holder rewards`,
  description:
    "Time-lock your pump.fun Holder Rewards coins without losing the rewards. Each lock is its own on-chain holder, so distributions keep flowing and you claim them any time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-slate-500">
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <a className="hover:text-white" href={X_URL} target="_blank" rel="noreferrer">
                𝕏 @cagedballs
              </a>
              <a className="hover:text-white" href={GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a className="hover:text-white" href="/api/stats" target="_blank" rel="noreferrer">
                API
              </a>
              <a className="hover:text-white" href="/how-it-works#api">
                API docs
              </a>
            </div>
            Locks are enforced by an on-chain program. Rewards depend on pump.fun&apos;s distribution
            rules, which we do not control. Nothing here is financial advice.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
