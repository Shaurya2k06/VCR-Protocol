// ─── Daily Spend Tracker — MongoDB Model ─────────────────────────────────────
import mongoose, { type Document, Schema } from "mongoose";

export interface IDailySpend extends Document {
  ensName: string;
  token: string;
  /** Date string in YYYY-MM-DD format (UTC) */
  date: string;
  /** Cumulative amount spent in base units (stored as string to avoid BigInt issues) */
  amountSpent: string;
  updatedAt: Date;
}

const DailySpendSchema = new Schema<IDailySpend>(
  {
    ensName: { type: String, required: true, lowercase: true },
    token: { type: String, required: true, uppercase: true },
    date: { type: String, required: true }, // YYYY-MM-DD UTC
    amountSpent: { type: String, required: true, default: "0" },
  },
  { timestamps: true }
);

// Compound unique index: (ensName, token, date) — one doc per agent per token per day
DailySpendSchema.index({ ensName: 1, token: 1, date: 1 }, { unique: true });

export const DailySpend = mongoose.model<IDailySpend>("DailySpend", DailySpendSchema);

// ─── Helper Functions ─────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-03-13"
}

/**
 * Get the cumulative spend for an agent (by ENS name) and token today.
 * Returns "0" if no spend recorded yet.
 */
export async function getDailySpent(ensName: string, token: string): Promise<string> {
  const doc = await DailySpend.findOne({
    ensName: ensName.toLowerCase(),
    token: token.toUpperCase(),
    date: todayUTC(),
  });
  return doc?.amountSpent ?? "0";
}

/**
 * Record a successful spend for an agent.
 * Uses findOneAndUpdate with upsert to atomically increment the amount.
 */
export async function recordSpend(
  ensName: string,
  token: string,
  amount: string
): Promise<IDailySpend> {
  const filter = {
    ensName: ensName.toLowerCase(),
    token: token.toUpperCase(),
    date: todayUTC(),
  };

  // Retry loop for atomic compare-and-swap (handles concurrent writes)
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await DailySpend.findOne(filter);
    const currentAmount = existing?.amountSpent ?? "0";
    const newAmount = (BigInt(currentAmount) + BigInt(amount)).toString();

    if (!existing) {
      // Insert new record — may fail with duplicate key if concurrent insert
      try {
        const doc = await DailySpend.create({ ...filter, amountSpent: newAmount });
        return doc;
      } catch (err: unknown) {
        if ((err as any).code === 11000) continue; // duplicate key — retry
        throw err;
      }
    } else {
      // Atomic update with version check
      const result = await DailySpend.findOneAndUpdate(
        { ...filter, amountSpent: currentAmount },
        { $set: { amountSpent: newAmount } },
        { new: true }
      );
      if (result) return result;
      // CAS failed — another writer changed it, retry
      continue;
    }
  }

  throw new Error("recordSpend: failed after 5 retries (concurrent write contention)");
}

/**
 * Get the full spend history for an agent (all tokens, all time).
 */
export async function getSpendHistory(
  ensName: string,
  limit = 30
): Promise<IDailySpend[]> {
  return DailySpend.find({ ensName: ensName.toLowerCase() })
    .sort({ date: -1 })
    .limit(limit);
}

/**
 * Reset today's cumulative spend for an agent/token back to zero.
 * Useful for deterministic demo reruns.
 */
export async function resetDailySpend(
  ensName: string,
  token: string,
): Promise<IDailySpend> {
  const filter = {
    ensName: ensName.toLowerCase(),
    token: token.toUpperCase(),
    date: todayUTC(),
  };

  const doc = await DailySpend.findOneAndUpdate(
    filter,
    { $set: { amountSpent: "0" } },
    { new: true, upsert: true },
  );

  return doc;
}
