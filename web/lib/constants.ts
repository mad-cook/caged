import { PublicKey } from "@solana/web3.js";

export const SITE_NAME = "Caged Diamond Balls";
export const X_URL = "https://x.com/cagedballs";
export const GITHUB_URL = "https://github.com/mad-cook/caged";
export const BRAND_NAME = "$CAGED";
export const BRAND_MINT = process.env.NEXT_PUBLIC_BRAND_MINT || "";

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER || "mainnet-beta") as
  | "mainnet-beta"
  | "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CLUSTER === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com");

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t",
);

// pump.fun
export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Rent-exempt minimum for a 0-byte account; the vault authority keeps this. */
export const VAULT_RESERVE_LAMPORTS = 650_240; // fallback only; fetched live via getMinimumBalanceForRentExemption(0)

export const EXPLORER = (sigOrAddr: string, type: "tx" | "address" = "address") =>
  `https://solscan.io/${type === "tx" ? "tx" : "account"}/${sigOrAddr}${
    CLUSTER === "devnet" ? "?cluster=devnet" : ""
  }`;
