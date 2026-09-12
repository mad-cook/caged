# Holder Locker

Time-lock pump.fun **Holder Rewards** coins without losing the rewards.

Pump.fun (Sept 12 2026 update) replaced Cashback with *Holder Rewards*: the creator fee on every trade is
set aside and pump.fun pays it out to the coin's holders several times an hour, automatically, with no
claim step. Their on-chain `distribute_fee_to_holders` instruction pays each **token account owner**
(SOL for SOL-quoted coins, the owner's quote ATA for token-quoted coins).

If you lock in a normal locker (Streamflow etc.) the vault contract becomes the holder and you stop
earning. This locker fixes that:

* every lock gets its own **vault authority PDA**: a data-less, system-owned account that looks exactly
  like a wallet and *owns* the vault token account;
* pump.fun pays that address; the SOL just accumulates there;
* the lock owner calls `claim_sol_rewards` (or `claim_token_rewards`) any time; the program signs for the
  PDA, takes the protocol fee, forwards the rest;
* locked tokens can only leave via `withdraw` after `unlock_ts`. No admin override.

## Fees (configurable by admin, hard-capped in the program)

| Fee | Default | Cap |
| --- | --- | --- |
| Lock creation | 0.1 SOL to treasury | 1 SOL |
| On every reward claim | 2% (200 bps) | 10% |
| Top-up / extend / withdraw / close | free | – |

Users also pay network fees and refundable rent (lock account, vault ATA, ~0.0009 SOL reserve on the
vault authority so a tiny first distribution can never fail). Rent comes back on `withdraw` + `close_lock`.

## Boost pools (for your own token)

The admin can attach a `BoostPool` to any mint: `capacity` (raw tokens), `min_duration` (seconds),
`bonus_bps` (10 000 = +100% = 2x). Locks that run at least `min_duration` are enrolled first-come until
capacity is full; when an enrolled lock claims SOL rewards, the pool pays `bonus_bps` of the net payout on
top (pro-rata if only part of the lock was enrolled). Fund it with `fund_boost_pool`; the sponsor can
`withdraw_boost_pool` any unspent SOL. Capacity is released when a lock withdraws.

Intended setup for the brand token: capacity = 25% of supply, min 7 days, 10 000 bps. Fund it from the
holder rewards your own 25% lock earns.

## Repo layout

```
programs/holder_locker/   Anchor program (Rust)
tests/                    anchor test suite (local validator)
scripts/                  init-config.ts, boost-pool.ts, sync-idl.js
web/                      Next.js 14 app (App Router) – deployed to Railway
```

## Toolchain (what this was built with)

* Anchor **0.30.1** (`~/.avm/bin/anchor`; the `anchor` on PATH is 0.29 - use `export PATH=$HOME/.avm/bin:$PATH`)
* Solana CLI **1.18.26** (platform-tools rust 1.75) – hence `rust-version = "1.75.0"` and the pinned lockfile.
  If `anchor build` complains about `edition2024`, run
  `cargo update -p <crate> --precise <older>` and change `version = 4` back to `3` in `Cargo.lock`.
* Node 20

## Build, test, deploy the program

```bash
./build.sh                    # = anchor build (0.30.1, IDL on nightly-2024-01-30) + IDL sync into web/idl
npm install
# local validator does not work on this Windows box (hangs after genesis), so test on devnet:
anchor test --skip-build --skip-local-validator --provider.cluster devnet --provider.wallet ~/solana-keypair.json
# (CI runs the same suite on a local validator: .github/workflows/test.yml)

# devnet first. On this Windows box `anchor deploy` fails ("N write transactions failed") because the CLI
# pushes writes over UDP/QUIC; send them over RPC instead (Helius devnet URL works, public RPC drops them):
solana program deploy target/deploy/holder_locker.so --program-id target/deploy/holder_locker-keypair.json \
  -u "https://devnet.helius-rpc.com/?api-key=..." -k ~/solana-keypair.json --use-rpc --max-sign-attempts 200 --with-compute-unit-price 5000
# if a deploy fails half-way, reclaim the buffer: solana program close --buffers -u devnet -k ~/solana-keypair.json
# upgrades: the program-data account is sized to the first binary; if the new .so is bigger, first run
#   solana program extend 65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t 40000 -u <url> -k ~/solana-keypair.json
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/solana-keypair.json \
  TREASURY=<your treasury pubkey> LOCK_FEE_SOL=0.1 REWARD_FEE_BPS=200 npm run init

# mainnet (same --use-rpc trick, ~2.5 SOL rent for the 480 KB program + tx fees)
solana program deploy target/deploy/holder_locker.so --program-id target/deploy/holder_locker-keypair.json \
  -u "https://mainnet.helius-rpc.com/?api-key=..." -k ~/solana-keypair.json --use-rpc --max-sign-attempts 200 --with-compute-unit-price 20000
ANCHOR_PROVIDER_URL="https://mainnet.helius-rpc.com/?api-key=..." ANCHOR_WALLET=~/solana-keypair.json \
  TREASURY=<treasury> npm run init
```

The program id is `65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t` (keypair in `target/deploy/`, git-ignored:
**back it up**; it is the upgrade authority target). Deploying costs roughly 2–3 SOL of rent for a program
this size.

Boost pool for your token:

```bash
MINT=<mint> ACTION=create CAPACITY_PCT=25 MIN_DAYS=7 BONUS_BPS=10000 npm run boost
MINT=<mint> ACTION=fund SOL=10 npm run boost
```

### Note on `anchor test` on Windows

`solana-test-validator` (1.17 and 1.18) starts but never serves RPC on this machine, and neither LiteSVM
nor Bankrun ship Windows binaries. The test suite therefore funds its wallets from the provider keypair
(no airdrops) and tolerates an already-initialized config, so it can be re-run on devnet. One full run
costs roughly 1.5 SOL of devnet SOL (fees + simulated rewards sent to throw-away wallets).

## Web app

```bash
cd web
cp .env.example .env.local     # fill in NEXT_PUBLIC_RPC_URL + HELIUS_API_KEY
npm install
npm run dev                    # http://localhost:3050
```

Environment:

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_RPC_URL` | Helius RPC incl. key (restrict the key to your domain in the Helius dashboard) |
| `NEXT_PUBLIC_CLUSTER` | `mainnet-beta` or `devnet` |
| `NEXT_PUBLIC_PROGRAM_ID` | deployed program id |
| `NEXT_PUBLIC_BRAND_MINT` / `NEXT_PUBLIC_BRAND_NAME` | optional, shows the boosted-token banner |
| `HELIUS_API_KEY` | server-only, used by `/api/token` for DAS metadata |

Pages: `/` create lock, `/locks` manage your locks (claim / withdraw / extend / top-up / close),
`/lock/<address>` public proof page, `/how-it-works`.

Holder-reward detection reads `is_holder_reward` from the pump.fun `BondingCurve`
(`["bonding-curve", mint]`) and, after graduation, the canonical PumpSwap `Pool`
(`["pool", 0u16, pool_authority, mint, quote]`). Offsets are in `web/lib/pump.ts` and were verified
against mainnet on 2026-09-12: e.g. mint `5gXxthzJJPnR4g6TPt5k1TyLS3dCqyurPfWkJvnpump` (Token-2022) has
`is_holder_reward = 1` and its curve creator is the pump.fun holder-rewards address
`EQmfmdtRZs2x44cp42J3fZHhbGvr4X3WKwEN7crQNTNs`.

## Deployments

| cluster | program | notes |
| --- | --- | --- |
| devnet | `65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t` | deployed 2026-09-12, upgrade authority `C7bttWUQDVGjxtUpAh1n18vRwQrbTaxV2kVmMkgD16xF` |
| mainnet | – | not yet (deployer wallet has 0 SOL on mainnet) |

## Railway

1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo. The root `railway.json` + `nixpacks.toml` build and
   start the `web/` app (or set the service Root Directory to `web`, which uses `web/railway.json`).
3. Add the env vars above in the service settings. Railway sets `PORT`; `npm start` honours it.
4. Health check: `/api/health`.

## Security notes / known limits

* pump.fun decides who counts as a holder. The vault authority is deliberately a plain system account so it
  is indistinguishable from a wallet, but pump.fun could change eligibility rules at any time.
* The reward split is done in the program; the frontend is untrusted.
* `claim_token_rewards` refuses the locked mint, so it can never bypass the time-lock.
* Only the config admin can create boost pools; only a pool's authority can drain it.
* The program has **not** been audited. Keep the upgrade authority on a hardware wallet or multisig.
