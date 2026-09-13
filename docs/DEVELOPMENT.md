# Development

## Design

Each lock has:

* a `Lock` account (`["lock", owner, lock_id]`) with owner, mint, amount, unlock time and reward stats;
* a `vault_authority` PDA (`["vault", lock]`): a data-less, system-owned account that owns the vault
  token account. It is pre-funded with the rent-exempt minimum so a small first distribution can never
  fail on an empty address. This is the address pump.fun pays;
* the vault: the vault authority's associated token account for the locked mint.

Instructions: `initialize`, `update_config`, `create_lock`, `top_up`, `extend_lock`, `withdraw`,
`claim_sol_rewards`, `claim_token_rewards`, `close_lock`, and the boost pool set
`create_boost_pool`, `update_boost_pool`, `fund_boost_pool`, `withdraw_boost_pool`.

`claim_token_rewards` refuses the locked mint so it cannot bypass the time-lock.

Boost pools are per mint (`["boost", mint]`): `capacity` (raw tokens), `min_duration` (seconds),
`bonus_bps` (10 000 = +100%). Locks are enrolled at creation or top-up, first come until capacity is
full; enrolled locks receive `bonus_bps` of their net payout on each claim, pro-rata to the enrolled
share. Capacity is released on withdrawal. A pool pays in one asset, chosen at creation:

* **SOL pool** (`reward_mint == Pubkey::default()`): lamports live on the pool account, funded with
  `fund_boost_pool` or a plain transfer; paid on `claim_sol_rewards`.
* **Token pool** (`reward_mint` set): tokens live in the pool PDA's associated token account, funded by a
  plain token transfer; paid on `claim_token_rewards` when the claimed mint matches. Use this when the
  coin is quoted in a token (holder rewards then arrive in that token). `withdraw_boost_pool_tokens`
  returns leftovers to the authority.

Every token transfer goes through `transfer_tokens`, which calls SPL's on-chain
`invoke_transfer_checked` for Token-2022 mints, so mints with an active transfer hook work as long as the
client passes the hook program, its extra-account-meta list and the extra accounts as remaining accounts
(`web/lib/hooks.ts` resolves them with `addExtraAccountMetasForExecute`). Mints whose hook extension has
no program set, which is the case for PUMP and the tokenized stocks today, need nothing extra.

## Toolchain

* Anchor 0.30.1, Solana CLI 1.18.x (platform-tools Rust 1.75). The lockfile is pinned accordingly;
  if `anchor build` complains about `edition2024`, pin the offending crate to an older version and keep
  `Cargo.lock` at `version = 3`.
* Anchor 0.30.1 generates the IDL with a nightly toolchain; recent nightlies removed an API it needs,
  so build with `RUSTUP_TOOLCHAIN=nightly-2024-01-30 anchor build` (see `build.sh`).
* Node 20.

## Build and test

```bash
./build.sh              # anchor build + copy IDL/types into web/idl
npm install
anchor test             # local validator
# or against devnet (funds test wallets from the provider keypair, no airdrops):
ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<keypair> npx ts-mocha -p ./tsconfig.json -t 1000000 tests/holder_locker.ts
```

CI runs the suite on a local validator (`.github/workflows/test.yml`).

## Deploy

```bash
solana program deploy target/deploy/holder_locker.so \
  --program-id target/deploy/holder_locker-keypair.json \
  -u <rpc> -k <upgrade-authority-keypair> --use-rpc --max-sign-attempts 200 --with-compute-unit-price 20000
```

`--use-rpc` sends the write transactions over HTTPS instead of directly to the leader, which is far more
reliable from most home networks. A failed deploy leaves a buffer; reclaim it with
`solana program close --buffers`. Upgrades need program-data headroom; extend with
`solana program extend <program> <bytes>` if the new binary is larger.

Then initialize (or update) the config:

```bash
ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<admin-keypair> \
TREASURY=<fee wallet> LOCK_FEE_SOL=0.1 REWARD_FEE_BPS=200 npm run init
```

Boost pool management (`scripts/boost-pool.ts`):

```bash
MINT=<mint> ACTION=create CAPACITY_PCT=25 MIN_DAYS=7 BONUS_BPS=10000 npm run boost                 # SOL pool
MINT=<mint> ACTION=create CAPACITY_PCT=25 MIN_DAYS=7 BONUS_BPS=10000 REWARD_MINT=<quote> npm run boost  # token pool
MINT=<mint> ACTION=fund SOL=2 npm run boost          # SOL pool (or just transfer SOL to the pool address)
MINT=<mint> ACTION=fund AMOUNT=1.5 npm run boost     # token pool (or transfer tokens to the pool's ATA)
MINT=<mint> ACTION=withdraw SOL=1 npm run boost      # / AMOUNT=1.5 for token pools
MINT=<mint> ACTION=update ACTIVE=false npm run boost
MINT=<mint> ACTION=show npm run boost
```

## Web app

```bash
cd web && cp .env.example .env.local && npm install && npm run dev
```

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_RPC_URL` | RPC endpoint used by the browser |
| `NEXT_PUBLIC_CLUSTER` | `mainnet-beta` or `devnet` |
| `NEXT_PUBLIC_PROGRAM_ID` | program id |
| `NEXT_PUBLIC_BRAND_MINT`, `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SITE_NAME` | branding |
| `HELIUS_API_KEY` | server-only, token metadata via DAS |

Holder-reward detection reads `is_holder_reward` from the pump.fun `BondingCurve`
(`["bonding-curve", mint]`) and, after graduation, the canonical PumpSwap `Pool`
(`["pool", 0u16, pool_authority, mint, quote]`). Offsets live in `web/lib/pump.ts`.

Hosting: the root `Dockerfile` builds and serves `web/`; `railway.json` points Railway at it.
`NEXT_PUBLIC_*` values are baked in at build time.
