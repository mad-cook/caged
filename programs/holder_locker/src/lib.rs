//! Holder Locker
//!
//! A time-lock for SPL / Token-2022 tokens that keeps the locked tokens
//! *eligible* for pump.fun Holder Rewards.
//!
//! Design in one paragraph: every lock gets its own `vault_authority` PDA that
//! is a plain, data-less, system-owned account (it looks exactly like a normal
//! wallet). The locked tokens sit in that PDA's associated token account. When
//! pump.fun distributes holder rewards (`distribute_fee_to_holders`) it pays the
//! *owner* of each holding token account, i.e. our PDA: native SOL for
//! SOL-quoted coins, or the owner's quote-token ATA for token-quoted coins. The
//! lock owner then calls `claim_sol_rewards` / `claim_token_rewards`; the
//! program signs for the PDA, takes the protocol fee, and forwards the rest.
//! Locked tokens themselves can only leave through `withdraw`, after `unlock_ts`.
//!
//! Boost pools: the protocol admin can attach a `BoostPool` to any mint. The
//! first `capacity` tokens locked for at least `min_duration` are enrolled and
//! receive an extra `bonus_bps` of every SOL reward claim, paid from the pool.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t");

pub const CONFIG_SEED: &[u8] = b"config";
pub const LOCK_SEED: &[u8] = b"lock";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BOOST_SEED: &[u8] = b"boost";

/// Hard cap on the reward fee the admin may configure (10%).
pub const MAX_REWARD_FEE_BPS: u16 = 1_000;
/// Hard cap on the lock creation fee the admin may configure (1 SOL).
pub const MAX_LOCK_FEE_LAMPORTS: u64 = 1_000_000_000;
/// Hard cap on a boost bonus (+500%).
pub const MAX_BONUS_BPS: u16 = 50_000;
/// Locks may not run longer than ~10 years.
pub const MAX_LOCK_DURATION: i64 = 10 * 365 * 24 * 60 * 60;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod holder_locker {
    use super::*;

    /// One-time protocol setup. The signer becomes the admin.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        require!(args.reward_fee_bps <= MAX_REWARD_FEE_BPS, LockerError::FeeTooHigh);
        require!(args.lock_fee_lamports <= MAX_LOCK_FEE_LAMPORTS, LockerError::FeeTooHigh);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.treasury = args.treasury;
        config.lock_fee_lamports = args.lock_fee_lamports;
        config.reward_fee_bps = args.reward_fee_bps;
        config.paused = false;
        config.bump = ctx.bumps.config;
        config.total_locks = 0;
        config.total_lock_fees = 0;
        config.total_reward_fees = 0;
        config.total_rewards_paid = 0;
        Ok(())
    }

    /// Admin-only parameter updates. Every field is optional.
    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(treasury) = args.treasury {
            config.treasury = treasury;
        }
        if let Some(fee) = args.lock_fee_lamports {
            require!(fee <= MAX_LOCK_FEE_LAMPORTS, LockerError::FeeTooHigh);
            config.lock_fee_lamports = fee;
        }
        if let Some(bps) = args.reward_fee_bps {
            require!(bps <= MAX_REWARD_FEE_BPS, LockerError::FeeTooHigh);
            config.reward_fee_bps = bps;
        }
        if let Some(paused) = args.paused {
            config.paused = paused;
        }
        if let Some(new_admin) = args.new_admin {
            config.admin = new_admin;
        }
        Ok(())
    }

    /// Lock `amount` of `mint` until `unlock_ts`. Charges the flat creation fee
    /// in lamports to the treasury. `lock_id` is any client-chosen u64 that is
    /// unique per (owner, lock_id); the UI uses a millisecond timestamp.
    /// Pass the mint's `BoostPool` (if one exists) to enroll in the boost.
    pub fn create_lock(
        ctx: Context<CreateLock>,
        lock_id: u64,
        amount: u64,
        unlock_ts: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.paused, LockerError::Paused);
        require!(amount > 0, LockerError::ZeroAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(unlock_ts > now, LockerError::UnlockInPast);
        require!(unlock_ts - now <= MAX_LOCK_DURATION, LockerError::LockTooLong);

        // 1) Flat creation fee -> treasury.
        if config.lock_fee_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.owner.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                config.lock_fee_lamports,
            )?;
            config.total_lock_fees = config
                .total_lock_fees
                .checked_add(config.lock_fee_lamports)
                .ok_or(LockerError::MathOverflow)?;
        }

        // 2) Make the vault authority a real, rent-exempt system account so a
        //    small first distribution can never fail on an empty address.
        let reserve = Rent::get()?.minimum_balance(0);
        let existing = ctx.accounts.vault_authority.lamports();
        if existing < reserve {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.owner.to_account_info(),
                        to: ctx.accounts.vault_authority.to_account_info(),
                    },
                ),
                reserve - existing,
            )?;
        }

        // 3) Move the tokens into the vault (ATA owned by the vault authority PDA).
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        // 4) Record the lock.
        let lock = &mut ctx.accounts.lock;
        lock.owner = ctx.accounts.owner.key();
        lock.mint = ctx.accounts.mint.key();
        lock.token_program = ctx.accounts.token_program.key();
        lock.vault_authority = ctx.accounts.vault_authority.key();
        lock.lock_id = lock_id;
        lock.amount = amount;
        lock.unlock_ts = unlock_ts;
        lock.created_ts = now;
        lock.withdrawn = false;
        lock.sol_rewards_claimed = 0;
        lock.boosted_amount = 0;
        lock.bonus_bps = 0;
        lock.bonus_paid = 0;
        lock.bump = ctx.bumps.lock;
        lock.vault_bump = ctx.bumps.vault_authority;

        // 5) Optional boost enrollment.
        if let Some(pool) = ctx.accounts.boost_pool.as_mut() {
            require_keys_eq!(pool.mint, lock.mint, LockerError::BoostPoolMintMismatch);
            let enrolled = enroll_boost(pool, amount, unlock_ts - now);
            if enrolled > 0 {
                lock.boosted_amount = enrolled;
                lock.bonus_bps = pool.bonus_bps;
            }
        }

        config.total_locks = config
            .total_locks
            .checked_add(1)
            .ok_or(LockerError::MathOverflow)?;

        emit!(LockCreated {
            lock: lock.key(),
            owner: lock.owner,
            mint: lock.mint,
            vault_authority: lock.vault_authority,
            amount,
            unlock_ts,
            boosted_amount: lock.boosted_amount,
        });
        Ok(())
    }

    /// Add more tokens to an existing, not-yet-withdrawn lock. No fee.
    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        require!(amount > 0, LockerError::ZeroAmount);
        let lock = &mut ctx.accounts.lock;
        require!(!lock.withdrawn, LockerError::AlreadyWithdrawn);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        lock.amount = lock
            .amount
            .checked_add(amount)
            .ok_or(LockerError::MathOverflow)?;

        if let Some(pool) = ctx.accounts.boost_pool.as_mut() {
            require_keys_eq!(pool.mint, lock.mint, LockerError::BoostPoolMintMismatch);
            let now = Clock::get()?.unix_timestamp;
            let enrolled = enroll_boost(pool, amount, lock.unlock_ts - now);
            if enrolled > 0 {
                lock.boosted_amount = lock
                    .boosted_amount
                    .checked_add(enrolled)
                    .ok_or(LockerError::MathOverflow)?;
                lock.bonus_bps = pool.bonus_bps;
            }
        }

        emit!(LockToppedUp {
            lock: lock.key(),
            amount,
            new_amount: lock.amount,
            boosted_amount: lock.boosted_amount,
        });
        Ok(())
    }

    /// Push the unlock date further into the future. Can never shorten a lock.
    pub fn extend_lock(ctx: Context<OwnerOnly>, new_unlock_ts: i64) -> Result<()> {
        let lock = &mut ctx.accounts.lock;
        require!(!lock.withdrawn, LockerError::AlreadyWithdrawn);
        require!(new_unlock_ts > lock.unlock_ts, LockerError::MustExtend);
        let now = Clock::get()?.unix_timestamp;
        require!(new_unlock_ts - now <= MAX_LOCK_DURATION, LockerError::LockTooLong);

        let old = lock.unlock_ts;
        lock.unlock_ts = new_unlock_ts;
        emit!(LockExtended {
            lock: lock.key(),
            old_unlock_ts: old,
            new_unlock_ts,
        });
        Ok(())
    }

    /// After `unlock_ts`: return every locked token to the owner and close the
    /// vault token account (rent goes back to the owner). The lock account is
    /// kept so late-arriving rewards can still be claimed; use `close_lock`
    /// afterwards to reclaim its rent.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let lock = &ctx.accounts.lock;
        require!(!lock.withdrawn, LockerError::AlreadyWithdrawn);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= lock.unlock_ts, LockerError::StillLocked);

        let lock_key = lock.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, lock_key.as_ref(), &[lock.vault_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        let vault_balance = ctx.accounts.vault.amount;
        if vault_balance > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.owner_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer,
                ),
                vault_balance,
                ctx.accounts.mint.decimals,
            )?;
        }

        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        ))?;

        // Release boost capacity back to the pool.
        if let Some(pool) = ctx.accounts.boost_pool.as_mut() {
            require_keys_eq!(pool.mint, lock.mint, LockerError::BoostPoolMintMismatch);
            pool.enrolled = pool.enrolled.saturating_sub(lock.boosted_amount);
        }

        let lock = &mut ctx.accounts.lock;
        lock.withdrawn = true;
        lock.amount = 0;
        lock.boosted_amount = 0;

        emit!(LockWithdrawn {
            lock: lock.key(),
            owner: lock.owner,
            amount: vault_balance,
        });
        Ok(())
    }

    /// Sweep every lamport above the rent reserve that pump.fun (or anyone)
    /// sent to the vault authority. `reward_fee_bps` goes to the treasury, the
    /// rest to the owner. If the lock is boost-enrolled and the mint's
    /// `BoostPool` is passed, the bonus is paid on top from the pool.
    pub fn claim_sol_rewards(ctx: Context<ClaimSolRewards>) -> Result<()> {
        let lock = &ctx.accounts.lock;
        let config = &ctx.accounts.config;

        let reserve = Rent::get()?.minimum_balance(0);
        let claimable = ctx
            .accounts
            .vault_authority
            .lamports()
            .saturating_sub(reserve);
        require!(claimable > 0, LockerError::NothingToClaim);

        let (fee, payout) = split_fee(claimable, config.reward_fee_bps)?;

        let lock_key = lock.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, lock_key.as_ref(), &[lock.vault_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        if fee > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault_authority.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }
        if payout > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault_authority.to_account_info(),
                        to: ctx.accounts.owner.to_account_info(),
                    },
                    signer,
                ),
                payout,
            )?;
        }

        // Boost bonus, paid from the pool's own lamports (no protocol fee).
        let mut bonus: u64 = 0;
        if let Some(pool) = ctx.accounts.boost_pool.as_mut() {
            require_keys_eq!(pool.mint, lock.mint, LockerError::BoostPoolMintMismatch);
            if pool.active && lock.boosted_amount > 0 && lock.amount > 0 && !lock.withdrawn {
                let wanted = (payout as u128)
                    .checked_mul(lock.bonus_bps as u128)
                    .and_then(|v| v.checked_mul(lock.boosted_amount as u128))
                    .ok_or(LockerError::MathOverflow)?
                    / (BPS_DENOMINATOR as u128 * lock.amount as u128);
                let pool_info = pool.to_account_info();
                let pool_reserve = Rent::get()?.minimum_balance(pool_info.data_len());
                let available = pool_info.lamports().saturating_sub(pool_reserve);
                bonus = (wanted as u64).min(available);
                if bonus > 0 {
                    **pool_info.try_borrow_mut_lamports()? -= bonus;
                    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += bonus;
                    pool.total_bonus_paid = pool
                        .total_bonus_paid
                        .checked_add(bonus)
                        .ok_or(LockerError::MathOverflow)?;
                }
            }
        }

        let lock = &mut ctx.accounts.lock;
        lock.sol_rewards_claimed = lock
            .sol_rewards_claimed
            .checked_add(payout)
            .ok_or(LockerError::MathOverflow)?;
        lock.bonus_paid = lock
            .bonus_paid
            .checked_add(bonus)
            .ok_or(LockerError::MathOverflow)?;

        let config = &mut ctx.accounts.config;
        config.total_reward_fees = config
            .total_reward_fees
            .checked_add(fee)
            .ok_or(LockerError::MathOverflow)?;
        config.total_rewards_paid = config
            .total_rewards_paid
            .checked_add(payout)
            .ok_or(LockerError::MathOverflow)?;

        emit!(RewardsClaimed {
            lock: lock.key(),
            owner: lock.owner,
            mint: None,
            gross: claimable,
            fee,
            payout,
            bonus,
        });
        Ok(())
    }

    /// Same as `claim_sol_rewards` but for an SPL / Token-2022 token that was
    /// sent to the vault authority (e.g. a token-quoted coin's rewards). The
    /// locked mint itself is refused so this can never bypass the time-lock.
    pub fn claim_token_rewards(ctx: Context<ClaimTokenRewards>) -> Result<()> {
        let lock = &ctx.accounts.lock;
        let config = &ctx.accounts.config;

        let claimable = ctx.accounts.reward_vault.amount;
        require!(claimable > 0, LockerError::NothingToClaim);

        let (fee, payout) = split_fee(claimable, config.reward_fee_bps)?;

        let lock_key = lock.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, lock_key.as_ref(), &[lock.vault_bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let decimals = ctx.accounts.reward_mint.decimals;

        if fee > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.reward_token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        mint: ctx.accounts.reward_mint.to_account_info(),
                        to: ctx.accounts.treasury_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer,
                ),
                fee,
                decimals,
            )?;
        }
        if payout > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.reward_token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        mint: ctx.accounts.reward_mint.to_account_info(),
                        to: ctx.accounts.owner_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer,
                ),
                payout,
                decimals,
            )?;
        }

        // Give the rent of the (now empty) reward account back to the owner.
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.reward_token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.reward_vault.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        ))?;

        emit!(RewardsClaimed {
            lock: lock.key(),
            owner: lock.owner,
            mint: Some(ctx.accounts.reward_mint.key()),
            gross: claimable,
            fee,
            payout,
            bonus: 0,
        });
        Ok(())
    }

    /// Close a withdrawn lock and get its rent back. Any lamports still sitting
    /// on the vault authority are swept: the rent reserve goes back to the
    /// owner untouched, anything above it is treated as rewards (fee applies).
    pub fn close_lock(ctx: Context<CloseLock>) -> Result<()> {
        let lock = &ctx.accounts.lock;
        require!(lock.withdrawn, LockerError::NotWithdrawn);

        let total = ctx.accounts.vault_authority.lamports();
        if total > 0 {
            let reserve = Rent::get()?.minimum_balance(0).min(total);
            let rewards = total - reserve;
            let (fee, payout) = split_fee(rewards, ctx.accounts.config.reward_fee_bps)?;
            let lock_key = lock.key();
            let seeds: &[&[u8]] = &[VAULT_SEED, lock_key.as_ref(), &[lock.vault_bump]];
            let signer: &[&[&[u8]]] = &[seeds];
            if fee > 0 {
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.vault_authority.to_account_info(),
                            to: ctx.accounts.treasury.to_account_info(),
                        },
                        signer,
                    ),
                    fee,
                )?;
            }
            let to_owner = payout + reserve;
            if to_owner > 0 {
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.vault_authority.to_account_info(),
                            to: ctx.accounts.owner.to_account_info(),
                        },
                        signer,
                    ),
                    to_owner,
                )?;
            }
        }
        emit!(LockClosed { lock: lock.key(), owner: lock.owner });
        Ok(())
    }

    // ----------------------------- boost pools -----------------------------

    /// Admin: create a boost pool for `mint`. `capacity` is in raw token
    /// units, `min_duration` in seconds, `bonus_bps` 10_000 = +100% (2x).
    pub fn create_boost_pool(
        ctx: Context<CreateBoostPool>,
        capacity: u64,
        min_duration: i64,
        bonus_bps: u16,
    ) -> Result<()> {
        require!(bonus_bps > 0 && bonus_bps <= MAX_BONUS_BPS, LockerError::FeeTooHigh);
        require!(min_duration >= 0, LockerError::InvalidDuration);
        let pool = &mut ctx.accounts.boost_pool;
        pool.mint = ctx.accounts.mint.key();
        pool.authority = ctx.accounts.admin.key();
        pool.capacity = capacity;
        pool.enrolled = 0;
        pool.min_duration = min_duration;
        pool.bonus_bps = bonus_bps;
        pool.total_bonus_paid = 0;
        pool.active = true;
        pool.bump = ctx.bumps.boost_pool;
        Ok(())
    }

    /// Pool authority: change parameters. Existing enrollments keep their bps.
    pub fn update_boost_pool(ctx: Context<BoostPoolAuthority>, args: UpdateBoostPoolArgs) -> Result<()> {
        let pool = &mut ctx.accounts.boost_pool;
        if let Some(c) = args.capacity {
            pool.capacity = c;
        }
        if let Some(d) = args.min_duration {
            require!(d >= 0, LockerError::InvalidDuration);
            pool.min_duration = d;
        }
        if let Some(b) = args.bonus_bps {
            require!(b > 0 && b <= MAX_BONUS_BPS, LockerError::FeeTooHigh);
            pool.bonus_bps = b;
        }
        if let Some(a) = args.active {
            pool.active = a;
        }
        if let Some(auth) = args.new_authority {
            pool.authority = auth;
        }
        Ok(())
    }

    /// Anyone: deposit SOL that funds the bonus payouts.
    pub fn fund_boost_pool(ctx: Context<FundBoostPool>, lamports: u64) -> Result<()> {
        require!(lamports > 0, LockerError::ZeroAmount);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.boost_pool.to_account_info(),
                },
            ),
            lamports,
        )?;
        emit!(BoostPoolFunded {
            pool: ctx.accounts.boost_pool.key(),
            funder: ctx.accounts.funder.key(),
            lamports,
        });
        Ok(())
    }

    /// Pool authority: take unspent SOL back out (rent reserve stays).
    pub fn withdraw_boost_pool(ctx: Context<BoostPoolAuthority>, lamports: u64) -> Result<()> {
        let pool_info = ctx.accounts.boost_pool.to_account_info();
        let reserve = Rent::get()?.minimum_balance(pool_info.data_len());
        let available = pool_info.lamports().saturating_sub(reserve);
        require!(lamports > 0 && lamports <= available, LockerError::InsufficientPoolFunds);
        **pool_info.try_borrow_mut_lamports()? -= lamports;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += lamports;
        Ok(())
    }
}

/// Split `gross` into (fee, payout) using basis points.
fn split_fee(gross: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = (gross as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(LockerError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    let fee = fee as u64;
    Ok((fee, gross - fee))
}

/// Enroll up to `amount` tokens into the pool if the lock is long enough.
/// Returns the enrolled amount (0 if not eligible / pool full).
fn enroll_boost(pool: &mut Account<BoostPool>, amount: u64, remaining_duration: i64) -> u64 {
    if !pool.active || remaining_duration < pool.min_duration {
        return 0;
    }
    let room = pool.capacity.saturating_sub(pool.enrolled);
    let enrolled = amount.min(room);
    pool.enrolled += enrolled;
    enrolled
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(lock_id: u64)]
pub struct CreateLock<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = treasury)]
    pub config: Account<'info, Config>,

    /// CHECK: validated against config.treasury via has_one.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program,
    )]
    pub owner_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = owner,
        space = 8 + Lock::INIT_SPACE,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock_id.to_le_bytes()],
        bump
    )]
    pub lock: Box<Account<'info, Lock>>,

    /// CHECK: data-less, system-owned PDA that *owns* the vault token account.
    /// This is the address pump.fun sees as "the holder" and pays rewards to.
    #[account(mut, seeds = [VAULT_SEED, lock.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Optional: the mint's boost pool, to enroll this lock.
    #[account(mut, seeds = [BOOST_SEED, mint.key().as_ref()], bump = boost_pool.bump)]
    pub boost_pool: Option<Box<Account<'info, BoostPool>>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TopUp<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
        has_one = mint,
        has_one = token_program,
        has_one = vault_authority,
    )]
    pub lock: Account<'info, Lock>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program,
    )]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: validated by has_one on the lock.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, seeds = [BOOST_SEED, mint.key().as_ref()], bump = boost_pool.bump)]
    pub boost_pool: Option<Account<'info, BoostPool>>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
    )]
    pub lock: Account<'info, Lock>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
        has_one = mint,
        has_one = token_program,
        has_one = vault_authority,
    )]
    pub lock: Account<'info, Lock>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program,
    )]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: validated by has_one + seeds.
    #[account(mut, seeds = [VAULT_SEED, lock.key().as_ref()], bump = lock.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, seeds = [BOOST_SEED, mint.key().as_ref()], bump = boost_pool.bump)]
    pub boost_pool: Option<Account<'info, BoostPool>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimSolRewards<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = treasury)]
    pub config: Account<'info, Config>,

    /// CHECK: validated against config.treasury via has_one.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
        has_one = vault_authority,
    )]
    pub lock: Account<'info, Lock>,

    /// CHECK: system-owned PDA holding the rewards; signs via seeds.
    #[account(mut, seeds = [VAULT_SEED, lock.key().as_ref()], bump = lock.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, seeds = [BOOST_SEED, lock.mint.as_ref()], bump = boost_pool.bump)]
    pub boost_pool: Option<Account<'info, BoostPool>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTokenRewards<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = treasury)]
    pub config: Account<'info, Config>,

    /// CHECK: validated against config.treasury via has_one.
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
        has_one = vault_authority,
        constraint = reward_mint.key() != lock.mint @ LockerError::CannotClaimLockedMint,
    )]
    pub lock: Account<'info, Lock>,

    /// CHECK: validated by has_one + seeds.
    #[account(mut, seeds = [VAULT_SEED, lock.key().as_ref()], bump = lock.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    // Boxed: four token-interface accounts + two init_if_needed overflow the 4 KB BPF stack.
    pub reward_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = reward_token_program,
    )]
    pub reward_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = reward_mint,
        associated_token::authority = owner,
        associated_token::token_program = reward_token_program,
    )]
    pub owner_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = reward_mint,
        associated_token::authority = treasury,
        associated_token::token_program = reward_token_program,
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub reward_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseLock<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = treasury)]
    pub config: Account<'info, Config>,

    /// CHECK: validated against config.treasury via has_one.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [LOCK_SEED, owner.key().as_ref(), &lock.lock_id.to_le_bytes()],
        bump = lock.bump,
        has_one = owner,
        has_one = vault_authority,
    )]
    pub lock: Account<'info, Lock>,

    /// CHECK: validated by has_one + seeds.
    #[account(mut, seeds = [VAULT_SEED, lock.key().as_ref()], bump = lock.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateBoostPool<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + BoostPool::INIT_SPACE,
        seeds = [BOOST_SEED, mint.key().as_ref()],
        bump
    )]
    pub boost_pool: Account<'info, BoostPool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BoostPoolAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [BOOST_SEED, boost_pool.mint.as_ref()],
        bump = boost_pool.bump,
        has_one = authority,
    )]
    pub boost_pool: Account<'info, BoostPool>,
}

#[derive(Accounts)]
pub struct FundBoostPool<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut, seeds = [BOOST_SEED, boost_pool.mint.as_ref()], bump = boost_pool.bump)]
    pub boost_pool: Account<'info, BoostPool>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    /// Flat fee charged on `create_lock`, in lamports.
    pub lock_fee_lamports: u64,
    /// Fee taken from every reward claim, in basis points.
    pub reward_fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
    pub total_locks: u64,
    pub total_lock_fees: u64,
    pub total_reward_fees: u64,
    pub total_rewards_paid: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Lock {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub vault_authority: Pubkey,
    pub lock_id: u64,
    pub amount: u64,
    pub unlock_ts: i64,
    pub created_ts: i64,
    pub withdrawn: bool,
    /// Net SOL paid out to the owner from rewards so far (after fee).
    pub sol_rewards_claimed: u64,
    /// Tokens of this lock enrolled in the mint's boost pool.
    pub boosted_amount: u64,
    /// Bonus rate captured at enrollment time.
    pub bonus_bps: u16,
    /// Total bonus SOL paid to the owner from the boost pool.
    pub bonus_paid: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BoostPool {
    pub mint: Pubkey,
    pub authority: Pubkey,
    /// Max raw token units that can be enrolled at once.
    pub capacity: u64,
    pub enrolled: u64,
    /// Minimum lock length (seconds) to qualify.
    pub min_duration: i64,
    /// Extra reward, in bps of the net payout. 10_000 = 2x.
    pub bonus_bps: u16,
    pub total_bonus_paid: u64,
    pub active: bool,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Args / events / errors
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub treasury: Pubkey,
    pub lock_fee_lamports: u64,
    pub reward_fee_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigArgs {
    pub treasury: Option<Pubkey>,
    pub lock_fee_lamports: Option<u64>,
    pub reward_fee_bps: Option<u16>,
    pub paused: Option<bool>,
    pub new_admin: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateBoostPoolArgs {
    pub capacity: Option<u64>,
    pub min_duration: Option<i64>,
    pub bonus_bps: Option<u16>,
    pub active: Option<bool>,
    pub new_authority: Option<Pubkey>,
}

#[event]
pub struct LockCreated {
    pub lock: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault_authority: Pubkey,
    pub amount: u64,
    pub unlock_ts: i64,
    pub boosted_amount: u64,
}

#[event]
pub struct LockToppedUp {
    pub lock: Pubkey,
    pub amount: u64,
    pub new_amount: u64,
    pub boosted_amount: u64,
}

#[event]
pub struct LockExtended {
    pub lock: Pubkey,
    pub old_unlock_ts: i64,
    pub new_unlock_ts: i64,
}

#[event]
pub struct LockWithdrawn {
    pub lock: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RewardsClaimed {
    pub lock: Pubkey,
    pub owner: Pubkey,
    /// None = native SOL, Some(mint) = SPL token reward.
    pub mint: Option<Pubkey>,
    pub gross: u64,
    pub fee: u64,
    pub payout: u64,
    pub bonus: u64,
}

#[event]
pub struct LockClosed {
    pub lock: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct BoostPoolFunded {
    pub pool: Pubkey,
    pub funder: Pubkey,
    pub lamports: u64,
}

#[error_code]
pub enum LockerError {
    #[msg("Fee or bonus exceeds the hard cap")]
    FeeTooHigh,
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Unlock time must be in the future")]
    UnlockInPast,
    #[msg("Lock duration exceeds the maximum")]
    LockTooLong,
    #[msg("Tokens are still locked")]
    StillLocked,
    #[msg("Lock has already been withdrawn")]
    AlreadyWithdrawn,
    #[msg("Lock has not been withdrawn yet")]
    NotWithdrawn,
    #[msg("New unlock time must be later than the current one")]
    MustExtend,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("The locked mint cannot be claimed as a reward")]
    CannotClaimLockedMint,
    #[msg("Boost pool does not belong to this mint")]
    BoostPoolMintMismatch,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Insufficient funds in the boost pool")]
    InsufficientPoolFunds,
    #[msg("Math overflow")]
    MathOverflow,
}
