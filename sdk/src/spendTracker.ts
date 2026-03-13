// ─── VCR Protocol SDK — Daily Spend Tracker ──────────────────────────────────
// In-memory implementation suitable for single-process / hackathon use.
// Replace the Map with Redis or a database for multi-process production use.

import type { SpendSummary } from "./types.js";

// ─── Internal State ───────────────────────────────────────────────────────────

interface SpendRecord {
  /** Cumulative amount spent today (base units) */
  amount: bigint;
  /** UTC date string "YYYY-MM-DD" — used to detect day rollover */
  date: string;
  lastTx?: {
    amount: string;
    recipient: string;
    timestamp: string;
  };
}

const spendMap = new Map<string, SpendRecord>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().split("T")[0]!;
}

function spendKey(ensName: string, token: string): string {
  return `${ensName}::${token}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the cumulative amount spent today (base units) for a given agent + token.
 * Resets to "0" at UTC midnight.
 */
export async function getDailySpent(
  ensName: string,
  token: string,
): Promise<string> {
  const key = spendKey(ensName, token);
  const record = spendMap.get(key);

  // Auto-reset on day rollover
  if (!record || record.date !== todayUTC()) {
    return "0";
  }

  return record.amount.toString();
}

/**
 * Record a spend for an agent + token.
 * Should be called ONLY after a payment is confirmed successful.
 *
 * @param ensName   - Agent's ENS name
 * @param token     - Token symbol, e.g. "USDC"
 * @param amount    - Amount in base units as string
 * @param recipient - Optional recipient address (stored for audit trail)
 */
export async function recordSpend(
  ensName: string,
  token: string,
  amount: string,
  recipient?: string,
): Promise<void> {
  const key = spendKey(ensName, token);
  const today = todayUTC();
  const existing = spendMap.get(key);

  // If there's a prior record for today, accumulate; otherwise start fresh
  const currentAmount =
    existing?.date === today ? existing.amount : 0n;

  const newTx =
    recipient !== undefined
      ? {
          amount,
          recipient,
          timestamp: new Date().toISOString(),
        }
      : existing?.date === today
        ? existing.lastTx
        : undefined;

  spendMap.set(key, {
    amount: currentAmount + BigInt(amount),
    date: today,
    lastTx: newTx,
  });
}

/**
 * Return a spend summary for display or logging.
 *
 * @param ensName    - Agent's ENS name
 * @param token      - Token symbol, e.g. "USDC"
 * @param dailyLimit - Policy daily limit in base units (string)
 */
export async function getSpendSummary(
  ensName: string,
  token: string,
  dailyLimit: string,
): Promise<SpendSummary> {
  const key = spendKey(ensName, token);
  const record = spendMap.get(key);
  const today = todayUTC();

  const spent: bigint =
    record?.date === today ? record.amount : 0n;
  const limit = BigInt(dailyLimit);
  const remaining = limit > spent ? limit - spent : 0n;

  // Next UTC midnight
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  );

  return {
    dailySpent: spent.toString(),
    dailyLimit,
    remainingToday: remaining.toString(),
    percentUsed: limit > 0n ? Number((spent * 100n) / limit) : 0,
    resetsAt: tomorrow.toISOString(),
    lastTransaction: record?.date === today ? record.lastTx : undefined,
  };
}

/**
 * Reset the spend record for an agent + token (e.g., for testing or manual override).
 */
export function resetDailySpend(ensName: string, token: string): void {
  spendMap.delete(spendKey(ensName, token));
}

/**
 * Clear all tracked spend data (useful in tests).
 */
export function clearAllSpendData(): void {
  spendMap.clear();
}
