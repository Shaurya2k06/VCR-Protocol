// ─── VCR Protocol SDK — Live Demo Script ──────────────────────────────────────
// Demonstrates the 5 key scenarios judges care about:
//   1. Resolve and display a VCR policy from ENS + IPFS
//   2. Allowed payment — passes all checks
//   3. Blocked — wrong recipient (not whitelisted)
//   4. Blocked — amount exceeds limit
//   5. Policy integrity check — BitGo hash vs on-chain commitment
//
// Usage:
//   npm run demo
//
// Requires:
//   - agents/researcher-001.json to exist (run `npm run setup` first)
//   - .env with SEPOLIA_RPC_URL and PINATA_GATEWAY set

import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import {
  resolveAgentPolicy,
  canAgentSpend,
  canAgentSpendWithPolicy,
  getSpendSummary,
  getDailySpent,
  recordSpend,
  resetDailySpend,
} from "../src/index.js";
import type { VCRPolicy } from "../src/types.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.SEPOLIA_RPC_URL;
if (!RPC_URL) {
  console.error("❌  SEPOLIA_RPC_URL is not set in .env");
  process.exit(1);
}

// Load the latest agent record — created by `npm run setup`
import fs from "fs";
import path from "path";

let agentRecord: { ensName: string; policyCid: string; policyHash: string };
try {
  const agentsDir = path.resolve(import.meta.dirname ?? ".", "..", "agents");
  const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".json"));
  if (files.length === 0) throw new Error("No agent files found");
  const latest = files
    .map((file) => {
      const filePath = path.join(agentsDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const record = JSON.parse(raw) as typeof agentRecord & { createdAt?: string };
      const createdAtMs = typeof record.createdAt === "string"
        ? Date.parse(record.createdAt)
        : Number.NaN;
      return {
        file,
        path: filePath,
        raw,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : -1,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => {
      if (b.createdAtMs !== a.createdAtMs) {
        return b.createdAtMs - a.createdAtMs;
      }
      return b.mtimeMs - a.mtimeMs;
    })[0]!;
  console.log(`  Loading agent: ${latest.file}`);
  agentRecord = JSON.parse(latest.raw) as typeof agentRecord;
} catch {
  console.error(
    "❌  No agent JSON found in agents/.\n" +
    "   Run `npm run setup` first to create an agent, then re-run this demo.",
  );
  process.exit(1);
}

const { ensName } = agentRecord;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function divider(title?: string) {
  const line = "═".repeat(54);
  if (title) {
    const pad = Math.max(0, Math.floor((54 - title.length - 2) / 2));
    console.log(`\n╔${line}╗`);
    console.log(`║${" ".repeat(pad)} ${title} ${" ".repeat(54 - pad - title.length - 2)}║`);
    console.log(`╚${line}╝\n`);
  } else {
    console.log(`\n${"─".repeat(56)}\n`);
  }
}

function usdcFormat(baseUnits: string): string {
  return `$${(Number(baseUnits) / 1e6).toFixed(2)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  divider("VCR Protocol — Live Demo");

  console.log(`  Agent ENS:  ${ensName}`);
  console.log(`  Network:    Sepolia (chain 11155111)\n`);

  // ── Scenario 1: Resolve policy ────────────────────────────────────────────
  console.log("┌─ [1] Resolving policy from ENS → IPFS ─────────────────────┐");

  let policy: VCRPolicy;
  try {
    const resolved = await resolveAgentPolicy(ensName, publicClient as any);
    if (!resolved) {
      console.error("│  ❌  No VCR policy pointer found on ENS.\n│  Has the agent been set up?");
      process.exit(1);
    }
    policy = resolved;
    console.log("│  ✅  Policy resolved successfully\n│");
    console.log(`│     Max per transaction : ${usdcFormat(policy.constraints.maxTransaction.amount)}`);
    console.log(`│     Daily limit         : ${usdcFormat(policy.constraints.dailyLimit.amount)}`);
    console.log(`│     Allowed tokens      : ${policy.constraints.allowedTokens.join(", ")}`);
    console.log(`│     Allowed chains      : ${policy.constraints.allowedChains.join(", ")}`);
    console.log(`│     Recipients          : ${policy.constraints.allowedRecipients.length} whitelisted address(es)`);
    if (policy.ipfs_cid) {
      console.log(`│     IPFS CID            : ${policy.ipfs_cid}`);
    }
    if (policy.policy_hash) {
      console.log(`│     Policy hash         : ${policy.policy_hash.slice(0, 22)}…`);
    }
    console.log("│");
    console.log("│     ℹ️   Policy fetched from IPFS and cached for 5 minutes.");
  } catch (err) {
    console.error(`│  ❌  Failed to resolve policy: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log("└────────────────────────────────────────────────────────────┘\n");

  const firstRecipient = policy.constraints.allowedRecipients[0]!;

  // ── Scenario 2: Allowed payment ───────────────────────────────────────────
  console.log("┌─ [2] Attempting an ALLOWED payment ($0.10 to whitelisted addr) ─┐");
  {
    const req = {
      amount: "100000",  // $0.10 USDC (6 decimals)
      token: "USDC",
      recipient: firstRecipient,
      chain: "base-sepolia",
    };

    const result = await canAgentSpend(ensName, req, getDailySpent);

    if (result.allowed) {
      console.log("│  ✅  VCR ALLOWED");
      console.log(`│     Amount:    ${usdcFormat(req.amount)}`);
      console.log(`│     Recipient: ${req.recipient.slice(0, 12)}…`);
      console.log("│     BitGo would be called next to execute the transfer.");
      // Record this simulated spend for the daily-limit scenario below
      await recordSpend(ensName, "USDC", req.amount, firstRecipient);
    } else {
      console.log(`│  ❌  Unexpectedly BLOCKED: ${result.reason}`);
    }
  }
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  // ── Scenario 3: Blocked — wrong recipient ─────────────────────────────────
  console.log("┌─ [3] Attempting a BLOCKED payment (unknown recipient) ──────────┐");
  {
    const unknownAddr = "0x1234567890123456789012345678901234567890";
    const req = {
      amount: "100000",
      token: "USDC",
      recipient: unknownAddr,
      chain: "base-sepolia",
    };

    const result = await canAgentSpend(ensName, req, getDailySpent);

    console.log(`│  ${result.allowed ? "✅  VCR ALLOWED (unexpected!)" : "❌  VCR BLOCKED"}`);
    console.log(`│     Reason: ${result.reason}`);
    console.log("│     ℹ️   BitGo was never called — policy enforced at ENS layer.");
  }
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  // ── Scenario 4: Blocked — amount over limit ────────────────────────────────
  console.log("┌─ [4] Attempting a BLOCKED payment (exceeds max-tx limit) ──────┐");
  {
    // Try $10,000 — well over any reasonable maxTransaction
    const hugeAmount = "10000000000"; // $10,000 USDC (6 decimals)
    const req = {
      amount: hugeAmount,
      token: "USDC",
      recipient: firstRecipient,
      chain: "base-sepolia",
    };

    const result = await canAgentSpend(ensName, req, getDailySpent);

    console.log(`│  ${result.allowed ? "✅  VCR ALLOWED (unexpected!)" : "❌  VCR BLOCKED"}`);
    console.log(`│     Requested : ${usdcFormat(req.amount)}`);
    console.log(`│     Max allowed: ${usdcFormat(policy.constraints.maxTransaction.amount)}`);
    console.log(`│     Reason: ${result.reason}`);
    console.log("│     ℹ️   BitGo was never called.");
  }
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  // ── Scenario 5: Policy integrity ──────────────────────────────────────────
  console.log("┌─ [5] Policy integrity check (on-chain hash vs live BitGo) ────┐");
  {
    if (policy.policy_hash) {
      console.log(`│  On-chain hash (from IPFS doc): ${policy.policy_hash.slice(0, 24)}…`);
      console.log("│");
      console.log("│  To verify live BitGo hash, call:");
      console.log("│    import { verifyPolicyIntegrity } from '@shaurya2k06/vcrsdk';");
      console.log("│    const wallet = await getWallet(agentRecord.walletId);");
      console.log("│    const result = await verifyPolicyIntegrity(ensName, wallet);");
      console.log("│    // result.match === true → policy has not drifted");
      console.log("│");
      console.log("│  ✅  Hash present — integrity check is available.");
      console.log("│     (Requires a live BitGo wallet instance for the live comparison.)");
    } else {
      console.log("│  ⚠️   No policy_hash in document — agent was created without integrity tracking.");
      console.log("│     Re-create the agent to enable integrity verification.");
    }
  }
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  // ── Spend summary ──────────────────────────────────────────────────────────
  console.log("┌─ [Summary] Daily spend status ─────────────────────────────────┐");
  {
    const summary = await getSpendSummary(
      ensName,
      "USDC",
      policy.constraints.dailyLimit.amount,
    );
    console.log(`│  Spent today      : ${usdcFormat(summary.dailySpent)}`);
    console.log(`│  Daily limit      : ${usdcFormat(summary.dailyLimit)}`);
    console.log(`│  Remaining today  : ${usdcFormat(summary.remainingToday)}`);
    console.log(`│  Percent used     : ${summary.percentUsed}%`);
    console.log(`│  Resets at        : ${summary.resetsAt}`);
    if (summary.lastTransaction) {
      console.log(`│  Last tx amount   : ${usdcFormat(summary.lastTransaction.amount)}`);
    }
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // Clean up simulated spend
  resetDailySpend(ensName, "USDC");

  divider("Demo complete");
  console.log("  Policy enforced at the ENS layer.");
  console.log("  No private server. No trust-me. On-chain commitment.");
  console.log("  canAgentSpend() is the gatekeeper — BitGo is last resort.\n");
}

main().catch((err) => {
  console.error("\n❌  Demo failed:", (err as Error).message);
  process.exit(1);
});
