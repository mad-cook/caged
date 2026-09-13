/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/holder_locker.json`.
 */
export type HolderLocker = {
  "address": "65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t",
  "metadata": {
    "name": "holderLocker",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Holder-rewards-preserving token locker for pump.fun coins"
  },
  "instructions": [
    {
      "name": "claimSolRewards",
      "docs": [
        "Sweep every lamport above the rent reserve that pump.fun (or anyone)",
        "sent to the vault authority. `reward_fee_bps` goes to the treasury, the",
        "rest to the owner. If the lock is boost-enrolled and the mint's SOL",
        "`BoostPool` is passed, the bonus is paid on top from the pool."
      ],
      "discriminator": [
        135,
        255,
        140,
        119,
        67,
        254,
        29,
        40
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock"
              }
            ]
          },
          "relations": [
            "lock"
          ]
        },
        {
          "name": "boostPool",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock.mint",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimTokenRewards",
      "docs": [
        "Same as `claim_sol_rewards` but for an SPL / Token-2022 token that was",
        "sent to the vault authority (e.g. a token-quoted coin's rewards). The",
        "locked mint itself is refused so this can never bypass the time-lock.",
        "If the mint's `BoostPool` pays in `reward_mint`, pass it together with",
        "its token account to receive the bonus.",
        "Remaining accounts: transfer-hook accounts for `reward_mint`, if any."
      ],
      "discriminator": [
        244,
        150,
        135,
        114,
        196,
        210,
        160,
        195
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock"
              }
            ]
          },
          "relations": [
            "lock"
          ]
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "rewardVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "boostPool",
          "docs": [
            "Optional: the locked mint's boost pool (only pays if it rewards in `reward_mint`)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock.mint",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "boostPoolTokenAccount",
          "docs": [
            "Optional: the pool's token account for `reward_mint`."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "boostPool"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "rewardTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeLock",
      "docs": [
        "Close a withdrawn lock and get its rent back. Any lamports still sitting",
        "on the vault authority are swept: the rent reserve goes back to the",
        "owner untouched, anything above it is treated as rewards (fee applies)."
      ],
      "discriminator": [
        58,
        254,
        183,
        130,
        151,
        238,
        95,
        54
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock"
              }
            ]
          },
          "relations": [
            "lock"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createBoostPool",
      "docs": [
        "Admin: create a boost pool for `mint`. `capacity` is in raw token",
        "units, `min_duration` in seconds, `bonus_bps` 10_000 = +100% (2x).",
        "Pass `reward_mint` to pay bonuses in that token instead of SOL; the",
        "pool's associated token account for it must then be created (anyone",
        "can, it is just an ATA owned by the pool PDA) and funded by transfer."
      ],
      "discriminator": [
        147,
        109,
        152,
        241,
        80,
        11,
        12,
        64
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "boostPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "rewardMint",
          "docs": [
            "Optional: pay bonuses in this token instead of SOL."
          ],
          "optional": true
        },
        {
          "name": "rewardTokenProgram",
          "docs": [
            "Optional: token program of `reward_mint`."
          ],
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "capacity",
          "type": "u64"
        },
        {
          "name": "minDuration",
          "type": "i64"
        },
        {
          "name": "bonusBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "createLock",
      "docs": [
        "Lock `amount` of `mint` until `unlock_ts`. Charges the flat creation fee",
        "in lamports to the treasury. `lock_id` is any client-chosen u64 that is",
        "unique per (owner, lock_id); the UI uses a millisecond timestamp.",
        "Pass the mint's `BoostPool` (if one exists) to enroll in the boost.",
        "Remaining accounts: transfer-hook accounts for `mint`, if any."
      ],
      "discriminator": [
        171,
        216,
        92,
        167,
        165,
        8,
        153,
        90
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "lockId"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "docs": [
            "This is the address pump.fun sees as \"the holder\" and pays rewards to."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "boostPool",
          "docs": [
            "Optional: the mint's boost pool, to enroll this lock."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lockId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "unlockTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "extendLock",
      "docs": [
        "Push the unlock date further into the future. Can never shorten a lock."
      ],
      "discriminator": [
        68,
        151,
        140,
        144,
        139,
        122,
        118,
        170
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newUnlockTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "fundBoostPool",
      "docs": [
        "Anyone: deposit SOL that funds the bonus payouts of a SOL pool."
      ],
      "discriminator": [
        104,
        32,
        109,
        179,
        128,
        185,
        179,
        72
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "boostPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "boost_pool.mint",
                "account": "boostPool"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "One-time protocol setup. The signer becomes the admin."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "topUp",
      "docs": [
        "Add more tokens to an existing, not-yet-withdrawn lock. No fee.",
        "Remaining accounts: transfer-hook accounts for `mint`, if any."
      ],
      "discriminator": [
        236,
        225,
        96,
        9,
        60,
        106,
        77,
        208
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "lock"
          ]
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "vaultAuthority",
          "relations": [
            "lock"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "boostPool",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "relations": [
            "lock"
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateBoostPool",
      "docs": [
        "Pool authority: change parameters. Existing enrollments keep their bps."
      ],
      "discriminator": [
        158,
        20,
        154,
        219,
        253,
        145,
        176,
        153
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "boostPool"
          ]
        },
        {
          "name": "boostPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "boost_pool.mint",
                "account": "boostPool"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateBoostPoolArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Admin-only parameter updates. Every field is optional."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateConfigArgs"
            }
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "After `unlock_ts`: return every locked token to the owner and close the",
        "vault token account (rent goes back to the owner). The lock account is",
        "kept so late-arriving rewards can still be claimed; use `close_lock`",
        "afterwards to reclaim its rent.",
        "Remaining accounts: transfer-hook accounts for `mint`, if any."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "lock"
          ]
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "lock.lock_id",
                "account": "lock"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "lock"
          ]
        },
        {
          "name": "ownerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lock"
              }
            ]
          },
          "relations": [
            "lock"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "boostPool",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "relations": [
            "lock"
          ]
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawBoostPool",
      "docs": [
        "Pool authority: take unspent SOL back out (rent reserve stays)."
      ],
      "discriminator": [
        203,
        50,
        186,
        57,
        242,
        87,
        35,
        95
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "boostPool"
          ]
        },
        {
          "name": "boostPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "boost_pool.mint",
                "account": "boostPool"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawBoostPoolTokens",
      "docs": [
        "Pool authority: take unspent reward tokens back out of a token pool.",
        "Remaining accounts: transfer-hook accounts for `reward_mint`, if any."
      ],
      "discriminator": [
        168,
        183,
        68,
        50,
        15,
        254,
        252,
        98
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "boostPool"
          ]
        },
        {
          "name": "boostPool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "boost_pool.mint",
                "account": "boostPool"
              }
            ]
          }
        },
        {
          "name": "rewardMint",
          "relations": [
            "boostPool"
          ]
        },
        {
          "name": "poolTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "boostPool"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "authorityTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "rewardTokenProgram"
              },
              {
                "kind": "account",
                "path": "rewardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "rewardTokenProgram",
          "relations": [
            "boostPool"
          ]
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "boostPool",
      "discriminator": [
        220,
        248,
        56,
        121,
        182,
        91,
        155,
        72
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "lock",
      "discriminator": [
        8,
        255,
        36,
        202,
        210,
        22,
        57,
        137
      ]
    }
  ],
  "events": [
    {
      "name": "boostPoolFunded",
      "discriminator": [
        61,
        215,
        26,
        91,
        183,
        2,
        158,
        48
      ]
    },
    {
      "name": "lockClosed",
      "discriminator": [
        163,
        163,
        91,
        3,
        79,
        54,
        172,
        68
      ]
    },
    {
      "name": "lockCreated",
      "discriminator": [
        244,
        216,
        59,
        77,
        83,
        47,
        61,
        196
      ]
    },
    {
      "name": "lockExtended",
      "discriminator": [
        25,
        118,
        227,
        150,
        119,
        138,
        207,
        234
      ]
    },
    {
      "name": "lockToppedUp",
      "discriminator": [
        0,
        192,
        85,
        173,
        43,
        164,
        178,
        190
      ]
    },
    {
      "name": "lockWithdrawn",
      "discriminator": [
        75,
        42,
        226,
        7,
        238,
        193,
        176,
        13
      ]
    },
    {
      "name": "rewardsClaimed",
      "discriminator": [
        75,
        98,
        88,
        18,
        219,
        112,
        88,
        121
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "feeTooHigh",
      "msg": "Fee or bonus exceeds the hard cap"
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6002,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "unlockInPast",
      "msg": "Unlock time must be in the future"
    },
    {
      "code": 6004,
      "name": "lockTooLong",
      "msg": "Lock duration exceeds the maximum"
    },
    {
      "code": 6005,
      "name": "stillLocked",
      "msg": "Tokens are still locked"
    },
    {
      "code": 6006,
      "name": "alreadyWithdrawn",
      "msg": "Lock has already been withdrawn"
    },
    {
      "code": 6007,
      "name": "notWithdrawn",
      "msg": "Lock has not been withdrawn yet"
    },
    {
      "code": 6008,
      "name": "mustExtend",
      "msg": "New unlock time must be later than the current one"
    },
    {
      "code": 6009,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6010,
      "name": "cannotClaimLockedMint",
      "msg": "The locked mint cannot be claimed as a reward"
    },
    {
      "code": 6011,
      "name": "boostPoolMintMismatch",
      "msg": "Boost pool does not belong to this mint"
    },
    {
      "code": 6012,
      "name": "invalidDuration",
      "msg": "Invalid duration"
    },
    {
      "code": 6013,
      "name": "insufficientPoolFunds",
      "msg": "Insufficient funds in the boost pool"
    },
    {
      "code": 6014,
      "name": "rewardMintProgramMismatch",
      "msg": "Reward mint and reward token program must be passed together and match"
    },
    {
      "code": 6015,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "boostPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "capacity",
            "docs": [
              "Max raw token units that can be enrolled at once."
            ],
            "type": "u64"
          },
          {
            "name": "enrolled",
            "type": "u64"
          },
          {
            "name": "minDuration",
            "docs": [
              "Minimum lock length (seconds) to qualify."
            ],
            "type": "i64"
          },
          {
            "name": "bonusBps",
            "docs": [
              "Extra reward, in bps of the net payout. 10_000 = 2x."
            ],
            "type": "u16"
          },
          {
            "name": "totalBonusPaid",
            "docs": [
              "Total bonus paid, in the reward asset's units."
            ],
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "rewardMint",
            "docs": [
              "Asset bonuses are paid in. `Pubkey::default()` = native SOL held on",
              "this account; otherwise a mint whose ATA (owned by this PDA) holds it."
            ],
            "type": "pubkey"
          },
          {
            "name": "rewardTokenProgram",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "boostPoolFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "funder",
            "type": "pubkey"
          },
          {
            "name": "lamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "lockFeeLamports",
            "docs": [
              "Flat fee charged on `create_lock`, in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "rewardFeeBps",
            "docs": [
              "Fee taken from every reward claim, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "totalLocks",
            "type": "u64"
          },
          {
            "name": "totalLockFees",
            "type": "u64"
          },
          {
            "name": "totalRewardFees",
            "type": "u64"
          },
          {
            "name": "totalRewardsPaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "lockFeeLamports",
            "type": "u64"
          },
          {
            "name": "rewardFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "lock",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenProgram",
            "type": "pubkey"
          },
          {
            "name": "vaultAuthority",
            "type": "pubkey"
          },
          {
            "name": "lockId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          },
          {
            "name": "createdTs",
            "type": "i64"
          },
          {
            "name": "withdrawn",
            "type": "bool"
          },
          {
            "name": "solRewardsClaimed",
            "docs": [
              "Net SOL paid out to the owner from rewards so far (after fee)."
            ],
            "type": "u64"
          },
          {
            "name": "boostedAmount",
            "docs": [
              "Tokens of this lock enrolled in the mint's boost pool."
            ],
            "type": "u64"
          },
          {
            "name": "bonusBps",
            "docs": [
              "Bonus rate captured at enrollment time."
            ],
            "type": "u16"
          },
          {
            "name": "bonusPaid",
            "docs": [
              "Total bonus paid to the owner from the boost pool, in the pool's",
              "reward asset (lamports for SOL pools, raw token units otherwise)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lockClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "lockCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vaultAuthority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          },
          {
            "name": "boostedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lockExtended",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "oldUnlockTs",
            "type": "i64"
          },
          {
            "name": "newUnlockTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lockToppedUp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "newAmount",
            "type": "u64"
          },
          {
            "name": "boostedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lockWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lock",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "None = native SOL, Some(mint) = SPL token reward."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "gross",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "bonus",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "updateBoostPoolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "capacity",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "minDuration",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bonusBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "active",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "newAuthority",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "updateConfigArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "lockFeeLamports",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "rewardFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "paused",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "newAdmin",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    }
  ]
};
