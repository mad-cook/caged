<p align="center">
  <img src="web/public/brand/locked-diamonds.webp" alt="Caged Diamond Balls" width="220" />
</p>

<h1 align="center">Caged Diamond Balls</h1>
<p align="center"><strong>Diamond balls. On lock.</strong><br/>
Lock your pump.fun coins. Keep the holder rewards.</p>

<p align="center">
  <a href="https://x.com/cagedballs">X / @cagedballs</a> ·
  <a href="https://solscan.io/account/65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t">Program on Solscan</a>
</p>

---

## The problem

Pump.fun **Holder Rewards** coins send the creator fee of every trade to the people holding the coin.
Pump.fun pays those distributions itself, several times an hour, straight to each holder's wallet.

Lock your tokens in an ordinary locker and you stop being a holder. The vault contract holds the
tokens, so the vault gets the rewards, and they are gone.

## What Caged does

Every lock on Caged gets **its own holder address**: a program-derived account that looks and behaves
exactly like a wallet and owns the vault token account. Pump.fun pays that address like any other
holder. The lock owner sweeps the rewards to their wallet whenever they like, while the tokens stay
locked until the unlock time they chose.

* **Your unlock date.** Pick a date and time. Extend any time. Never shorten.
* **Claim while locked.** SOL rewards (and token-quoted rewards such as XMR or stable-quoted coins)
  accumulate on the lock and are claimable at any moment.
* **Public proof.** Every lock has a shareable page anyone can verify on-chain. Every token has a page
  showing how much of its supply is locked and by whom.
* **No admin override.** Nothing can release locked tokens early.
* Works with classic SPL and Token-2022 mints.

## Fees

| | |
| --- | --- |
| Lock creation | 0.1 SOL |
| Reward claims | 2% of the claimed amount |
| Top up, extend, withdraw, close | free |

Plus normal Solana network fees and refundable account rent, which comes back when a lock is closed.
Fees are capped in the program itself (max 1 SOL and 10%).

## The $CAGED reward match

$CAGED holders who lock for **7 days or more** are enrolled in a boost pool, first come, first served,
up to **25% of supply**. Enrolled locks receive a **1:1 match** on their net SOL holder rewards, paid
from a pool funded by the team's own locked allocation. If the pool runs dry, base rewards continue
unaffected.

## Public API

Free, no key, CORS enabled, cached ~20 seconds. Built for terminals and bots.

```
GET /api/locks/<mint>   totals, % of supply, boost pool, every lock for one token
GET /api/stats          protocol-wide counters
```

## On-chain

| | |
| --- | --- |
| Program | `65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t` |
| Framework | Anchor |
| Source | [`programs/holder_locker`](programs/holder_locker/src/lib.rs) |

The program is small and open source. Read it before locking large amounts. It has not been
independently audited.

Pump.fun decides who counts as a holder and how much each receives; Caged makes each lock
indistinguishable from a normal holder wallet, but pump.fun's rules can change at any time.

## Repository

```
programs/   Anchor program
web/        Next.js app (site + API)
tests/      program test suite
```

Developer notes are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
