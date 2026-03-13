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
  const current = await getDailySpent(ensName, token);
  const newAmount = (BigInt(current) + BigInt(amount)).toString();

  const doc = await DailySpend.findOneAndUpdate(
    {
      ensName: ensName.toLowerCase(),
      token: token.toUpperCase(),
      date: todayUTC(),
    },
    { $set: { amountSpent: newAmount } },
    { upsert: true, new: true }
  );

  return doc!;
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
