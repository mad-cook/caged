import { BRAND_NAME, PROGRAM_ID, EXPLORER } from "@/lib/constants";
import BrandMark from "@/components/BrandMark";
import Link from "next/link";

export default function HowItWorks() {
  return (
    <article className="doc-page mx-auto max-w-3xl space-y-8">
      <section>
        <div className="mb-6 flex items-center justify-between gap-4"><div><p className="eyebrow mb-4">Know what you are locking into</p><h1 className="page-title">How it works</h1></div><BrandMark className="hidden h-24 w-20 shrink-0 sm:block" /></div>
        <p className="mt-3 text-slate-300">
          Pump.fun&apos;s <strong>Holder Rewards</strong> coins send the creator fee of every trade to the coin&apos;s
          holders instead of the creator. Pump.fun runs the distribution itself: it looks at who holds the coin
          and pays each holder&apos;s <em>wallet</em>, several times an hour, with no claim step.
        </p>
        <p className="mt-3 text-slate-300">
          Locking moves your tokens into a vault. Reward compatibility depends on who owns that vault and
          whether the locker can pass distributions through to you. Caged Diamond Balls gives each lock
          its own holder address and lets its owner claim eligible rewards.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-bold">What this locker does differently</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-300">
          <li>
            Every lock gets its <strong>own holder address</strong> (a program-derived address that looks and behaves
            like a normal wallet). Your tokens go into that address&apos;s token account.
          </li>
          <li>Pump.fun pays that address like any other holder. The SOL simply accumulates there.</li>
          <li>
            Only you, the lock owner, can tell the program to <strong>sweep those rewards</strong> to your wallet. The
            program takes its fee and forwards the rest. This works any time, even while the tokens are still locked.
          </li>
          <li>
            The locked tokens themselves cannot move until the unlock time you chose. There is no admin key that can
            release them early.
          </li>
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-bold">Fees</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-300">
          <li>A flat fee per lock creation. The current amount is shown in the lock form.</li>
          <li>A percentage of each reward claim, shown before you lock. No fee on the locked tokens themselves.</li>
          <li>You pay normal Solana network fees and refundable account rent. Rent comes back when you close a lock.</li>
          <li>Topping up, extending and withdrawing are free apart from network fees.</li>
        </ul>
      </section>

      <section className="card p-5" id="boost">
        <p className="eyebrow mb-3">A little more conviction</p>
        <h2 className="text-xl font-bold">The {BRAND_NAME} reward match</h2>
        <p className="mt-3 text-slate-300">
          A boost pool can be attached to a token. Locks that run at least the pool&apos;s minimum duration are enrolled
          on a first-come basis until the pool&apos;s capacity is full. Whenever an enrolled lock claims rewards, the
          pool pays an extra percentage on top, from SOL the pool sponsor deposited. For {BRAND_NAME}: lock for 7
          days or more, with capacity for up to 25% of supply. Enrolled amounts can receive a 1:1 match on
          net SOL holder rewards, depending on available pool funds. If only part of a lock fits, only that
          part earns a match. Capacity is released on withdrawal; waiting locks are not automatically enrolled.
          If the pool runs dry the base rewards are unaffected.
        </p>
      </section>

      <section className="card p-5" id="api">
        <h2 className="text-xl font-bold">Public API</h2>
        <p className="mt-3 text-slate-300">
          Free, no key, CORS enabled, cached about 20 seconds. Built for trading terminals and bots.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-950 p-3 text-xs text-slate-200">
{`GET /api/locks/<mint>   # totals + every lock for one token
{
  "mint": "...", "symbol": "...", "decimals": 6,
  "totalLockedRaw": "123000000", "totalLocked": "123",
  "percentOfSupply": 12.34, "lockCount": 3, "activeLockCount": 2, "uniqueLockers": 2,
  "nextUnlockTs": 1790000000,
  "pump": { "isPump": true, "isHolderReward": true, "graduated": false, ... },
  "boostPool": { "bonusBps": 10000, "minDurationSeconds": 604800, ... } | null,
  "locks": [ { "address", "owner", "amountRaw", "amount", "unlockTs", "withdrawn", ... } ]
}

GET /api/stats          # protocol-wide counters (total locks, fees, rewards paid)`}
        </pre>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-bold">Before you lock</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-300">
          <li>
            Pump.fun decides who counts as a holder and how much each gets. We built the lock so it looks like a
            normal holder, but pump.fun could change its rules at any time.
          </li>
          <li>Locks are irreversible until the unlock time. Double-check the date before confirming.</li>
          <li>Smart-contract risk exists. The program is small and open source; read it before locking large amounts.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Program:{" "}
          <a className="break-all underline" href={EXPLORER(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
            {PROGRAM_ID.toBase58()}
          </a>
        </p>
      </section>
      <Link href="/#create-lock" className="btn-primary">Create your lock →</Link>
    </article>
  );
}
