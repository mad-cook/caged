import BN from "bn.js";
import { LAMPORTS_PER_SOL } from "./constants";

export function shortAddr(a: string, n = 4): string {
  return a.length <= n * 2 + 3 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}

export function lamportsToSol(lamports: number | bigint | BN, digits = 4): string {
  const n = typeof lamports === "number" ? lamports : Number(lamports.toString());
  return (n / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/** raw u64 -> human string with decimals */
export function formatUnits(raw: bigint | BN | string, decimals: number, maxFrac = 2): string {
  const big = BigInt(raw.toString());
  const base = 10n ** BigInt(decimals);
  const whole = big / base;
  const frac = big % base;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const wholeStr = whole.toLocaleString();
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/** raw u64 -> plain "1234567.89" with no grouping and a dot decimal (safe to feed back into parseUnits) */
export function formatUnitsPlain(raw: bigint | BN | string, decimals: number): string {
  const big = BigInt(raw.toString());
  const base = 10n ** BigInt(decimals);
  const whole = big / base;
  const frac = (big % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * human string -> raw bigint; throws on bad input.
 * Tolerates thousands separators (comma, space, NBSP, narrow NBSP, apostrophe)
 * and a comma used as the decimal separator (e.g. "2 000 000", "1,5", "1.234,56").
 */
export function parseUnits(value: string, decimals: number): bigint {
  let v = value.trim().replace(/[\s  ']/g, "");
  const commas = (v.match(/,/g) || []).length;
  const dots = (v.match(/\./g) || []).length;
  if (commas > 0 && dots > 0) {
    // whichever separator comes last is the decimal one
    if (v.lastIndexOf(",") > v.lastIndexOf(".")) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
  } else if (commas === 1 && !/,\d{3}$/.test(v)) {
    v = v.replace(",", "."); // single comma not followed by exactly 3 digits: decimal comma
  } else {
    v = v.replace(/,/g, "");
  }
  if (!/^\d*(\.\d*)?$/.test(v) || v === "" || v === ".") throw new Error("Invalid amount");
  const [w, f = ""] = v.split(".");
  const fracPadded = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function countdown(unlockTs: number, now = Date.now() / 1000): string {
  let s = Math.max(0, Math.floor(unlockTs - now));
  if (s === 0) return "Unlocked";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function durationLabel(seconds: number): string {
  const d = Math.round(seconds / 86400);
  if (d >= 365) return `${(d / 365).toFixed(d % 365 === 0 ? 0 : 1)}y`;
  if (d >= 1) return `${d}d`;
  return `${Math.round(seconds / 3600)}h`;
}

/** local datetime-input value (YYYY-MM-DDTHH:mm) for a unix ts */
export function toDatetimeLocal(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
