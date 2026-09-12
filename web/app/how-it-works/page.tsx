import { BRAND_NAME, PROGRAM_ID, EXPLORER } from "@/lib/constants";

export default function HowItWorks() {
  return (
    <article className="prose-invert mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-3xl font-black">How it works</h1>
        <p className="mt-3 text-slate-300">
          Pump.fun&apos;s <strong>Holder Rewards</strong> coins send the creator fee of every trade to the coin&apos;s
          holders instead of the creator. Pump.fun runs the distribution itself: it looks at who holds the coin
          and pays each holder&apos;s <em>wallet</em>, several times an hour, with no claim step.
        </p>
        <p className="mt-3 text-slate-300">
          The catch: if you lock tokens in a normal locker, they move into a vault owned by the locker
          contract. From pump.fun&apos;s point of view <em>the locker</em> is now the holder, not you.
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
          <li>Flat fee per lock creation (shown in the form, currently 0.1 SOL).</li>
          <li>A small percentage of every reward claim (currently 2%). No fee on the locked tokens themselves.</li>
          <li>You pay normal Solana network fees and refundable account rent. Rent comes back when you close a lock.</li>
          <li>Topping up, extending and withdrawing are free apart from network fees.</li>
        </ul>
      </section>

      <section className="card p-5" id="boost">
        <h2 className="text-xl font-bold">🔥 Boost pools ({BRAND_NAME})</h2>
        <p className="mt-3 text-slate-300">
          A boost pool can be attached to a token. Locks that run at least the pool&apos;s minimum duration are enrolled
          on a first-come basis until the pool&apos;s capacity is full. Whenever an enrolled lock claims rewards, the
          pool pays an extra percentage on top, from SOL the pool sponsor deposited. For {BRAND_NAME}: lock for 7
          days or more, and the first 25% of supply locked earns 2x. If the pool runs dry the base rewards are
          unaffected.
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
        <h2 className="text-xl font-bold">Risks and honesty</h2>
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
          <a className="underline" href={EXPLORER(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
            {PROGRAM_ID.toBase58()}
          </a>
        </p>
      </section>
    </article>
  );
}
