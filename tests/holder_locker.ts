import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { HolderLocker } from "../target/types/holder_locker";

let RESERVE = 890_880; // rent-exempt minimum for a 0-byte account; refreshed from the cluster in before()

describe("holder_locker", () => {
  // AnchorProvider.env() defaults to "processed"; on a real cluster reads right after a tx would
  // then miss it, so rebuild the provider at "confirmed".
  const envProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new Connection(envProvider.connection.rpcEndpoint, "confirmed"),
    envProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.HolderLocker as Program<HolderLocker>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  /** Cluster time (devnet's clock can differ from this machine's by tens of seconds). */
  async function chainNow(): Promise<number> {
    const slot = await conn.getSlot("confirmed");
    const t = await conn.getBlockTime(slot);
    return t ?? Math.floor(Date.now() / 1000);
  }

  const treasury = Keypair.generate();
  const user = Keypair.generate();
  let mint: PublicKey;
  let mint22: PublicKey;
  let userAta: PublicKey;
  const decimals = 6;

  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const lockPda = (owner: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lock"), owner.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const vaultAuthPda = (lock: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), lock.toBuffer()], program.programId)[0];
  const boostPda = (m: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("boost"), m.toBuffer()], program.programId)[0];

  const ata = (owner: PublicKey, m: PublicKey, prog = TOKEN_PROGRAM_ID) =>
    getAssociatedTokenAddressSync(m, owner, true, prog, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Fund from the provider wallet (works on devnet too, where airdrops are rate-limited).
  async function airdrop(pk: PublicKey, sol = 5) {
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: pk, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
      ),
    );
  }

  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  before(async () => {
    RESERVE = await conn.getMinimumBalanceForRentExemption(0);
    await airdrop(user.publicKey, 0.7);
    await airdrop(treasury.publicKey, 0.01);
    mint = await createMint(conn, admin, admin.publicKey, null, decimals);
    userAta = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, user.publicKey)).address;
    await mintTo(conn, admin, mint, userAta, admin, 1_000_000 * 10 ** decimals);

    mint22 = await createMint(conn, admin, admin.publicKey, null, decimals, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    const a22 = await getOrCreateAssociatedTokenAccount(
      conn, admin, mint22, user.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID,
    );
    await mintTo(conn, admin, mint22, a22.address, admin, 1_000 * 10 ** decimals, [], undefined, TOKEN_2022_PROGRAM_ID);
  });

  it("initializes config", async () => {
    const existing = await program.account.config.fetchNullable(configPda);
    if (!existing) {
      await program.methods
        .initialize({ treasury: treasury.publicKey, lockFeeLamports: new BN(0.1 * LAMPORTS_PER_SOL), rewardFeeBps: 200 })
        .accounts({ admin: admin.publicKey })
        .rpc();
    } else {
      // Re-run on a persistent cluster (devnet): point the config at this run's treasury.
      await program.methods
        .updateConfig({
          treasury: treasury.publicKey,
          lockFeeLamports: new BN(0.1 * LAMPORTS_PER_SOL),
          rewardFeeBps: 200,
          paused: false,
          newAdmin: null,
        })
        .accounts({ admin: admin.publicKey })
        .rpc();
    }
    const c = await program.account.config.fetch(configPda);
    assert.ok(c.admin.equals(admin.publicKey));
    assert.ok(c.treasury.equals(treasury.publicKey));
    assert.equal(c.rewardFeeBps, 200);
    assert.equal(c.lockFeeLamports.toNumber(), 0.1 * LAMPORTS_PER_SOL);
  });

  const totalLocksBefore = async () => (await program.account.config.fetch(configPda)).totalLocks.toNumber();
  let locksAtStart = 0;
  before(async () => {
    locksAtStart = await totalLocksBefore().catch(() => 0);
  });

  it("rejects fee above cap", async () => {
    try {
      await program.methods
        .updateConfig({ treasury: null, lockFeeLamports: null, rewardFeeBps: 5000, paused: null, newAdmin: null })
        .accounts({ admin: admin.publicKey })
        .rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.include(e.toString(), "FeeTooHigh");
    }
  });

  const lockId = new BN(1);
  let lock: PublicKey;
  let vaultAuth: PublicKey;
  const amount = new BN(500_000 * 10 ** decimals);

  it("creates a lock (charges fee, funds reserve, moves tokens)", async () => {
    lock = lockPda(user.publicKey, lockId);
    vaultAuth = vaultAuthPda(lock);
    const unlockTs = (await chainNow()) + 30;
    const treasBefore = await conn.getBalance(treasury.publicKey);

    await program.methods
      .createLock(lockId, amount, new BN(unlockTs))
      .accountsPartial({
        config: configPda,
        treasury: treasury.publicKey,
        owner: user.publicKey,
        mint,
        ownerTokenAccount: userAta,
        lock,
        vaultAuthority: vaultAuth,
        vault: ata(vaultAuth, mint),
        boostPool: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const l = await program.account.lock.fetch(lock);
    assert.ok(l.owner.equals(user.publicKey));
    assert.equal(l.amount.toString(), amount.toString());
    assert.equal(l.unlockTs.toNumber(), unlockTs);
    assert.isFalse(l.withdrawn);

    const vault = await getAccount(conn, ata(vaultAuth, mint));
    assert.equal(vault.amount.toString(), amount.toString());
    assert.ok(vault.owner.equals(vaultAuth));

    // vault authority is a system-owned, rent-exempt, data-less account
    const info = await conn.getAccountInfo(vaultAuth);
    assert.ok(info!.owner.equals(SystemProgram.programId));
    assert.equal(info!.data.length, 0);
    assert.equal(info!.lamports, RESERVE);

    assert.equal((await conn.getBalance(treasury.publicKey)) - treasBefore, 0.1 * LAMPORTS_PER_SOL);
    const c = await program.account.config.fetch(configPda);
    assert.equal(c.totalLocks.toNumber(), locksAtStart + 1);
  });

  it("cannot withdraw before unlock", async () => {
    try {
      await program.methods
        .withdraw()
        .accountsPartial({
          owner: user.publicKey,
          lock,
          mint,
          ownerTokenAccount: userAta,
          vaultAuthority: vaultAuth,
          vault: ata(vaultAuth, mint),
          boostPool: null,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.include(e.toString(), "StillLocked");
    }
  });

  it("claims SOL rewards that landed on the vault authority (2% fee)", async () => {
    // simulate pump.fun distribution: plain SOL transfer to the holder address
    const reward = 0.2 * LAMPORTS_PER_SOL;
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: vaultAuth, lamports: reward }),
    );
    await provider.sendAndConfirm(tx);

    const userBefore = await conn.getBalance(user.publicKey);
    const treasBefore = await conn.getBalance(treasury.publicKey);

    await program.methods
      .claimSolRewards()
      .accountsPartial({
        config: configPda,
        treasury: treasury.publicKey,
        owner: user.publicKey,
        lock,
        vaultAuthority: vaultAuth,
        boostPool: null,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const fee = reward * 0.02;
    assert.equal((await conn.getBalance(treasury.publicKey)) - treasBefore, fee);
    const gained = (await conn.getBalance(user.publicKey)) - userBefore;
    assert.approximately(gained, reward - fee, 20_000); // minus tx fee
    assert.equal(await conn.getBalance(vaultAuth), RESERVE); // reserve stays

    const l = await program.account.lock.fetch(lock);
    assert.equal(l.solRewardsClaimed.toNumber(), reward - fee);
  });

  it("nothing to claim -> error", async () => {
    try {
      await program.methods
        .claimSolRewards()
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: user.publicKey,
          lock,
          vaultAuthority: vaultAuth,
          boostPool: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.include(e.toString(), "NothingToClaim");
    }
  });

  it("claims token rewards (airdropped SPL token) and refuses the locked mint", async () => {
    const rewardMint = await createMint(conn, admin, admin.publicKey, null, 9);
    const rewardVault = (await getOrCreateAssociatedTokenAccount(conn, admin, rewardMint, vaultAuth, true)).address;
    await mintTo(conn, admin, rewardMint, rewardVault, admin, 1_000_000_000);

    await program.methods
      .claimTokenRewards()
      .accountsPartial({
        config: configPda,
        treasury: treasury.publicKey,
        owner: user.publicKey,
        lock,
        vaultAuthority: vaultAuth,
        rewardMint,
        rewardVault,
        ownerTokenAccount: ata(user.publicKey, rewardMint),
        treasuryTokenAccount: ata(treasury.publicKey, rewardMint),
        boostPool: null,
        boostPoolTokenAccount: null,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    assert.equal((await getAccount(conn, ata(user.publicKey, rewardMint))).amount.toString(), "980000000");
    assert.equal((await getAccount(conn, ata(treasury.publicKey, rewardMint))).amount.toString(), "20000000");
    assert.isNull(await conn.getAccountInfo(rewardVault)); // closed

    // the locked mint cannot be pulled through this path
    try {
      await program.methods
        .claimTokenRewards()
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: user.publicKey,
          lock,
          vaultAuthority: vaultAuth,
          rewardMint: mint,
          rewardVault: ata(vaultAuth, mint),
          ownerTokenAccount: userAta,
          treasuryTokenAccount: ata(treasury.publicKey, mint),
          boostPool: null,
          boostPoolTokenAccount: null,
          rewardTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.include(e.toString(), "CannotClaimLockedMint");
    }
  });

  it("extends but never shortens", async () => {
    const l0 = await program.account.lock.fetch(lock);
    try {
      await program.methods.extendLock(l0.unlockTs.subn(1)).accountsPartial({ owner: user.publicKey, lock }).signers([user]).rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.include(e.toString(), "MustExtend");
    }
    await program.methods.extendLock(l0.unlockTs.addn(2)).accountsPartial({ owner: user.publicKey, lock }).signers([user]).rpc();
    const l1 = await program.account.lock.fetch(lock);
    assert.equal(l1.unlockTs.toNumber(), l0.unlockTs.toNumber() + 2);
  });

  it("tops up", async () => {
    await program.methods
      .topUp(new BN(1_000_000))
      .accountsPartial({
        owner: user.publicKey,
        lock,
        mint,
        ownerTokenAccount: userAta,
        vaultAuthority: vaultAuth,
        vault: ata(vaultAuth, mint),
        boostPool: null,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    const l = await program.account.lock.fetch(lock);
    assert.equal(l.amount.toString(), amount.addn(1_000_000).toString());
  });

  it("another wallet cannot withdraw / claim", async () => {
    const mallory = Keypair.generate();
    await airdrop(mallory.publicKey, 0.02);
    try {
      await program.methods
        .claimSolRewards()
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: mallory.publicKey,
          lock,
          vaultAuthority: vaultAuth,
          boostPool: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([mallory])
        .rpc();
      assert.fail("should fail");
    } catch (e: any) {
      assert.match(e.toString(), /ConstraintSeeds|ConstraintHasOne|seeds constraint/i);
    }
  });

  it("withdraws after unlock, then closes and gets rent + reserve back", async () => {
    // wait for unlock
    const target = (await program.account.lock.fetch(lock)).unlockTs.toNumber() + 3;
    for (let i = 0; i < 90; i++) {
      if ((await chainNow()) >= target) break;
      await sleep(2000);
    }
    const before = await getAccount(conn, userAta);
    await program.methods
      .withdraw()
      .accountsPartial({
        owner: user.publicKey,
        lock,
        mint,
        ownerTokenAccount: userAta,
        vaultAuthority: vaultAuth,
        vault: ata(vaultAuth, mint),
        boostPool: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    const after = await getAccount(conn, userAta);
    assert.equal((after.amount - before.amount).toString(), amount.addn(1_000_000).toString());
    assert.isNull(await conn.getAccountInfo(ata(vaultAuth, mint)));
    const l = await program.account.lock.fetch(lock);
    assert.isTrue(l.withdrawn);
    assert.equal(l.amount.toNumber(), 0);

    // late reward arrives after withdrawal, still claimable via close
    const late = 0.1 * LAMPORTS_PER_SOL;
    await provider.sendAndConfirm(
      new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: vaultAuth, lamports: late })),
    );
    const userBefore = await conn.getBalance(user.publicKey);
    await program.methods
      .closeLock()
      .accountsPartial({
        config: configPda,
        treasury: treasury.publicKey,
        owner: user.publicKey,
        lock,
        vaultAuthority: vaultAuth,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    assert.isNull(await program.account.lock.fetchNullable(lock));
    assert.equal(await conn.getBalance(vaultAuth), 0);
    const gained = (await conn.getBalance(user.publicKey)) - userBefore;
    // late reward minus 2% + reserve + lock rent, minus tx fee
    assert.isAbove(gained, late * 0.98 + RESERVE);
  });

  it("locks a Token-2022 mint", async () => {
    const id = new BN(22);
    const l = lockPda(user.publicKey, id);
    const va = vaultAuthPda(l);
    await program.methods
      .createLock(id, new BN(100 * 10 ** decimals), new BN(Math.floor(Date.now() / 1000) + 3600))
      .accountsPartial({
        config: configPda,
        treasury: treasury.publicKey,
        owner: user.publicKey,
        mint: mint22,
        ownerTokenAccount: ata(user.publicKey, mint22, TOKEN_2022_PROGRAM_ID),
        lock: l,
        vaultAuthority: va,
        vault: ata(va, mint22, TOKEN_2022_PROGRAM_ID),
        boostPool: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    const v = await getAccount(conn, ata(va, mint22, TOKEN_2022_PROGRAM_ID), "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.equal(v.amount.toString(), (100 * 10 ** decimals).toString());
  });

  describe("boost pool", () => {
    let pool: PublicKey;
    const capacity = new BN(100 * 10 ** decimals);

    it("admin creates + funds a pool", async () => {
      pool = boostPda(mint);
      await program.methods
        .createBoostPool(capacity, new BN(2), 10_000) // min 2s lock, +100%
        .accountsPartial({ admin: admin.publicKey, mint, rewardMint: null, rewardTokenProgram: null })
        .rpc();
      await program.methods
        .fundBoostPool(new BN(0.3 * LAMPORTS_PER_SOL))
        .accountsPartial({ funder: admin.publicKey, boostPool: pool })
        .rpc();
      const p = await program.account.boostPool.fetch(pool);
      assert.equal(p.capacity.toString(), capacity.toString());
      assert.isTrue(p.active);
      assert.isAbove(await conn.getBalance(pool), 0.3 * LAMPORTS_PER_SOL);
    });

    it("non-admin cannot create a pool", async () => {
      try {
        await program.methods
          .createBoostPool(capacity, new BN(2), 10_000)
          .accountsPartial({ admin: user.publicKey, mint: mint22, rewardMint: null, rewardTokenProgram: null })
          .signers([user])
          .rpc();
        assert.fail("should fail");
      } catch (e: any) {
        assert.match(e.toString(), /ConstraintHasOne|has one/i);
      }
    });

    it("enrolls first-come up to capacity and pays 2x on claim", async () => {
      const id = new BN(77);
      const l = lockPda(user.publicKey, id);
      const va = vaultAuthPda(l);
      const amt = new BN(150 * 10 ** decimals); // > capacity: only 100 boosted
      await program.methods
        .createLock(id, amt, new BN(Math.floor(Date.now() / 1000) + 3600))
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: user.publicKey,
          mint,
          ownerTokenAccount: userAta,
          lock: l,
          vaultAuthority: va,
          vault: ata(va, mint),
          boostPool: pool,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      const lk = await program.account.lock.fetch(l);
      assert.equal(lk.boostedAmount.toString(), capacity.toString());
      assert.equal(lk.bonusBps, 10_000);
      const p = await program.account.boostPool.fetch(pool);
      assert.equal(p.enrolled.toString(), capacity.toString());

      // reward 0.3 SOL -> net 0.294; boosted share 100/150 -> bonus 0.196
      const reward = 0.1 * LAMPORTS_PER_SOL;
      await provider.sendAndConfirm(
        new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: va, lamports: reward })),
      );
      const before = await conn.getBalance(user.publicKey);
      await program.methods
        .claimSolRewards()
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: user.publicKey,
          lock: l,
          vaultAuthority: va,
          boostPool: pool,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      const gained = (await conn.getBalance(user.publicKey)) - before;
      const net = reward * 0.98;
      const bonus = Math.floor((net * 10_000 * capacity.toNumber()) / (10_000 * amt.toNumber()));
      assert.approximately(gained, net + bonus, 20_000);
      const lk2 = await program.account.lock.fetch(l);
      assert.equal(lk2.bonusPaid.toNumber(), bonus);
    });

    it("a second lock gets nothing once capacity is full", async () => {
      const id = new BN(78);
      const l = lockPda(user.publicKey, id);
      const va = vaultAuthPda(l);
      await program.methods
        .createLock(id, new BN(10 * 10 ** decimals), new BN(Math.floor(Date.now() / 1000) + 3600))
        .accountsPartial({
          config: configPda,
          treasury: treasury.publicKey,
          owner: user.publicKey,
          mint,
          ownerTokenAccount: userAta,
          lock: l,
          vaultAuthority: va,
          vault: ata(va, mint),
          boostPool: pool,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      const lk = await program.account.lock.fetch(l);
      assert.equal(lk.boostedAmount.toNumber(), 0);
    });

    it("token-denominated pool pays the bonus in the reward token", async () => {
      // fresh locked mint with its own pool that rewards in rewardMint9 (a 9-decimal SPL token)
      const mintB = await createMint(conn, admin, admin.publicKey, null, decimals);
      const userB = (await getOrCreateAssociatedTokenAccount(conn, admin, mintB, user.publicKey)).address;
      await mintTo(conn, admin, mintB, userB, admin, 1_000 * 10 ** decimals);
      const rewardMint9 = await createMint(conn, admin, admin.publicKey, null, 9);
      const poolB = boostPda(mintB);
      await program.methods
        .createBoostPool(new BN(1_000 * 10 ** decimals), new BN(2), 10_000)
        .accountsPartial({ admin: admin.publicKey, mint: mintB, rewardMint: rewardMint9, rewardTokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      const pb = await program.account.boostPool.fetch(poolB);
      assert.ok(pb.rewardMint.equals(rewardMint9));
      // fund the pool's token account (plain mint/transfer, no instruction needed)
      const poolAta = (await getOrCreateAssociatedTokenAccount(conn, admin, rewardMint9, poolB, true)).address;
      await mintTo(conn, admin, rewardMint9, poolAta, admin, 5_000_000_000);

      const id = new BN(79);
      const l = lockPda(user.publicKey, id);
      const va = vaultAuthPda(l);
      await program.methods
        .createLock(id, new BN(100 * 10 ** decimals), new BN(Math.floor(Date.now() / 1000) + 3600))
        .accountsPartial({
          config: configPda, treasury: treasury.publicKey, owner: user.publicKey, mint: mintB,
          ownerTokenAccount: userB, lock: l, vaultAuthority: va, vault: ata(va, mintB), boostPool: poolB,
          tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([user]).rpc();
      assert.equal((await program.account.lock.fetch(l)).boostedAmount.toString(), (100 * 10 ** decimals).toString());

      // simulate a token-quoted distribution: 1.0 reward tokens land on the holder address
      const rv = (await getOrCreateAssociatedTokenAccount(conn, admin, rewardMint9, va, true)).address;
      await mintTo(conn, admin, rewardMint9, rv, admin, 1_000_000_000);

      await program.methods
        .claimTokenRewards()
        .accountsPartial({
          config: configPda, treasury: treasury.publicKey, owner: user.publicKey, lock: l, vaultAuthority: va,
          rewardMint: rewardMint9, rewardVault: rv,
          ownerTokenAccount: ata(user.publicKey, rewardMint9), treasuryTokenAccount: ata(treasury.publicKey, rewardMint9),
          boostPool: poolB, boostPoolTokenAccount: poolAta,
          rewardTokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([user]).rpc();
      // net 0.98 + 100% bonus (fully enrolled) = 1.96 to owner; fee 0.02 to treasury; pool down by 0.98
      assert.equal((await getAccount(conn, ata(user.publicKey, rewardMint9))).amount.toString(), "1960000000");
      assert.equal((await getAccount(conn, ata(treasury.publicKey, rewardMint9))).amount.toString(), "20000000");
      assert.equal((await getAccount(conn, poolAta)).amount.toString(), "4020000000");
      const lk = await program.account.lock.fetch(l);
      assert.equal(lk.bonusPaid.toString(), "980000000");

      // authority pulls leftover tokens out; a stranger cannot
      try {
        await program.methods.withdrawBoostPoolTokens(new BN(1)).accountsPartial({
          authority: user.publicKey, boostPool: poolB, rewardMint: rewardMint9, poolTokenAccount: poolAta,
          authorityTokenAccount: ata(user.publicKey, rewardMint9), rewardTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        }).signers([user]).rpc();
        assert.fail("should fail");
      } catch (e: any) { assert.match(e.toString(), /ConstraintHasOne|has one/i); }
      await program.methods.withdrawBoostPoolTokens(new BN(4_020_000_000)).accountsPartial({
        authority: admin.publicKey, boostPool: poolB, rewardMint: rewardMint9, poolTokenAccount: poolAta,
        authorityTokenAccount: ata(admin.publicKey, rewardMint9), rewardTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      }).rpc();
      assert.equal((await getAccount(conn, poolAta)).amount.toString(), "0");
    });

    it("authority withdraws leftover pool funds; others cannot", async () => {
      try {
        await program.methods
          .withdrawBoostPool(new BN(1))
          .accountsPartial({ authority: user.publicKey, boostPool: pool })
          .signers([user])
          .rpc();
        assert.fail("should fail");
      } catch (e: any) {
        assert.match(e.toString(), /ConstraintHasOne|has one/i);
      }
      const before = await conn.getBalance(admin.publicKey);
      await program.methods
        .withdrawBoostPool(new BN(0.1 * LAMPORTS_PER_SOL))
        .accountsPartial({ authority: admin.publicKey, boostPool: pool })
        .rpc();
      assert.isAbove(await conn.getBalance(admin.publicKey), before + 0.1 * LAMPORTS_PER_SOL - 20_000);
    });
  });
});
