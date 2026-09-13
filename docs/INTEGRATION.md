# Integrating Caged locks (for terminals, screeners and bots)

Caged is an on-chain token locker on Solana. Locked tokens keep earning pump.fun Holder Rewards
because every lock has its own holder address. This page is everything needed to show Caged locks
next to a token, the same way Streamflow or Jupiter Lock locks are shown.

## Option A: REST (simplest)

```
GET https://<caged domain>/api/locks/<mint>
```

Free, no key, CORS `*`, cached ~20 s. Response (abridged):

```json
{
  "mint": "…", "symbol": "…", "decimals": 6, "supplyRaw": "1000000000000000",
  "totalLockedRaw": "250000000000000", "totalLocked": "250,000,000", "percentOfSupply": 25,
  "lockCount": 12, "activeLockCount": 11, "uniqueLockers": 9, "nextUnlockTs": 1790000000,
  "pump": { "isPump": true, "isHolderReward": true, "graduated": false, "quoteMint": null },
  "rewardAsset": null,
  "boostPool": { "bonusBps": 10000, "minDurationSeconds": 604800, "enrolledRaw": "…", "capacityRaw": "…" },
  "locks": [
    { "address": "…", "owner": "…", "vaultAuthority": "…", "amountRaw": "…", "amount": "…",
      "unlockTs": 1790000000, "createdTs": 1789000000, "withdrawn": false }
  ]
}
```

`GET /api/stats` returns protocol-wide counters. Public lock page: `https://<caged domain>/lock/<address>`.

## Option B: read the chain directly

| | |
| --- | --- |
| Program | `65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t` (mainnet + devnet) |
| Framework | Anchor 0.30; IDL in [`web/idl/holder_locker.json`](../web/idl/holder_locker.json) |
| Lock account discriminator | `[8, 255, 36, 202, 210, 22, 57, 137]` |

`Lock` account layout (Borsh, little-endian):

| offset | field | type |
| --- | --- | --- |
| 0 | discriminator | 8 bytes |
| 8 | owner | pubkey |
| 40 | mint | pubkey |
| 72 | token_program | pubkey |
| 104 | vault_authority | pubkey (the holder address that owns the vault ATA) |
| 136 | lock_id | u64 |
| 144 | amount | u64 (raw units; 0 after withdrawal) |
| 152 | unlock_ts | i64 (unix seconds) |
| 160 | created_ts | i64 |
| 168 | withdrawn | bool |
| 169 | sol_rewards_claimed | u64 |
| 177 | boosted_amount | u64 |
| 185 | bonus_bps | u16 |
| 187 | bonus_paid | u64 |
| 195 | bump, vault_bump | u8, u8 |

All locks for a mint, one RPC call:

```js
connection.getProgramAccounts(PROGRAM_ID, {
  filters: [
    { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([8,255,36,202,210,22,57,137])) } },
    { memcmp: { offset: 40, bytes: MINT } },
  ],
});
```

Locked amount of a token = sum of `amount` over accounts where `withdrawn == false`. Locks can be
extended (`unlock_ts` grows) and topped up (`amount` grows); they can never be shortened. The
tokens physically sit in the associated token account of `vault_authority` for `mint`.

Events (Anchor `emit!`): `LockCreated`, `LockToppedUp`, `LockExtended`, `LockWithdrawn`,
`RewardsClaimed`, `LockClosed`. Subscribe to program logs to update in real time.

## Contact

X: [@cagedballs](https://x.com/cagedballs) · GitHub: [mad-cook/caged](https://github.com/mad-cook/caged)
