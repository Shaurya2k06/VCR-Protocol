// ─── VCR Protocol SDK — Agent Setup CLI ───────────────────────────────────────
// One-shot script to create a fully-configured VCR agent.
//
// Usage:
//   npm run setup
//   npm run setup -- --name my-agent --domain acmecorp.eth --max-tx 500 --daily 5000
//
// All flags are optional — defaults are read from environment variables or
// sensible fallbacks are applied.
//
// Required environment variables (.env):
//   BITGO_ACCESS_TOKEN
//   BITGO_ENTERPRISE_ID
//   PINATA_JWT
//   PINATA_GATEWAY
//   PRIVATE_KEY
//   SEPOLIA_RPC_URL
//
// Output:
//   agents/<name>.json   — agent record (safe to version-control, no secrets)
//   agents/<name>.key    — plaintext BitGo user key (git-ignored, mode 0o600)

import "dotenv/config";
import { createAgent } from "../src/createAgent.js";
import type { CreateAgentConfig } from "../src/types.js";

// ─── Argument parser ──────────────────────────────────────────────────────────

interface ParsedArgs {
  name: string;
  domain: string;
  maxTx: string;
  daily: string;
  recipients: string[];
  tokens: string[];
  chains: string[];
  hours?: [number, number];
  description?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // strip "node" and script path
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const getAll = (flag: string): string[] => {
    const results: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag && args[i + 1]) {
        results.push(args[i + 1]!);
      }
    }
    return results;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const name =
    get("--name") ??
    process.env.AGENT_NAME ??
    `agent-${Date.now()}`;

  const domain =
    get("--domain") ??
    process.env.ENS_BASE_DOMAIN ??
    "example.eth";

  const maxTx =
    get("--max-tx") ??
    process.env.MAX_TX_USDC ??
    "500";

  const daily =
    get("--daily") ??
    process.env.DAILY_LIMIT_USDC ??
    "5000";

  // Recipients: --recipient 0xABC --recipient 0xDEF  OR  comma-separated env var
  let recipients = getAll("--recipient");
  if (recipients.length === 0 && process.env.ALLOWED_RECIPIENTS) {
    recipients = process.env.ALLOWED_RECIPIENTS.split(",").map((r) => r.trim());
  }

  let tokens = getAll("--token");
  if (tokens.length === 0) {
    tokens = (process.env.ALLOWED_TOKENS ?? "USDC").split(",").map((t) => t.trim());
  }

  let chains = getAll("--chain");
  if (chains.length === 0) {
    chains = (process.env.ALLOWED_CHAINS ?? "base-sepolia").split(",").map((c) => c.trim());
  }

  // --hours 9 17  (two separate args after --hours)
  let hours: [number, number] | undefined;
  const hoursIdx = args.indexOf("--hours");
  if (hoursIdx !== -1 && args[hoursIdx + 1] && args[hoursIdx + 2]) {
    const start = parseInt(args[hoursIdx + 1]!, 10);
    const end   = parseInt(args[hoursIdx + 2]!, 10);
    if (!isNaN(start) && !isNaN(end)) {
      hours = [start, end];
    }
  }

  const description = get("--description") ?? process.env.AGENT_DESCRIPTION;
  const dryRun = has("--dry-run");

  return { name, domain, maxTx, daily, recipients, tokens, chains, hours, description, dryRun };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnv(): {
  BITGO_ACCESS_TOKEN: string;
  BITGO_ENTERPRISE_ID: string;
  PINATA_JWT: string;
  PINATA_GATEWAY: string;
  PRIVATE_KEY: string;
  SEPOLIA_RPC_URL: string;
} {
  const required = [
    "BITGO_ACCESS_TOKEN",
    "BITGO_ENTERPRISE_ID",
    "PINATA_JWT",
    "PINATA_GATEWAY",
    "PRIVATE_KEY",
    "SEPOLIA_RPC_URL",
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `\n❌  Missing required environment variables:\n` +
      missing.map((k) => `   • ${k}`).join("\n") +
      `\n\n   Copy .env.example to .env and fill in the values.\n`,
    );
    process.exit(1);
  }

  return {
    BITGO_ACCESS_TOKEN:  process.env.BITGO_ACCESS_TOKEN!,
    BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID!,
    PINATA_JWT:          process.env.PINATA_JWT!,
    PINATA_GATEWAY:      process.env.PINATA_GATEWAY!,
    PRIVATE_KEY:         process.env.PRIVATE_KEY!,
    SEPOLIA_RPC_URL:     process.env.SEPOLIA_RPC_URL!,
  };
}

function validateArgs(args: ParsedArgs): void {
  const errors: string[] = [];

  if (!/^[a-z0-9-]+$/.test(args.name)) {
    errors.push(`--name "${args.name}" must contain only lowercase letters, numbers, and hyphens`);
  }
  if (!args.domain.includes(".")) {
    errors.push(`--domain "${args.domain}" must be a valid ENS name (e.g. acmecorp.eth)`);
  }
  const maxTxNum = parseFloat(args.maxTx);
  if (isNaN(maxTxNum) || maxTxNum <= 0) {
    errors.push(`--max-tx "${args.maxTx}" must be a positive number`);
  }
  const dailyNum = parseFloat(args.daily);
  if (isNaN(dailyNum) || dailyNum <= 0) {
    errors.push(`--daily "${args.daily}" must be a positive number`);
  }
  if (!isNaN(maxTxNum) && !isNaN(dailyNum) && maxTxNum > dailyNum) {
    errors.push(`--max-tx (${args.maxTx}) cannot exceed --daily (${args.daily})`);
  }
  if (args.recipients.length === 0) {
    errors.push(
      `No --recipient addresses provided.\n` +
      `   Use --recipient 0xABC --recipient 0xDEF\n` +
      `   or set ALLOWED_RECIPIENTS=0xABC,0xDEF in .env\n` +
      `   ⚠️  All recipients must be added now — BitGo policy locks after 48 hours.`,
    );
  }
  for (const addr of args.recipients) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      errors.push(`Invalid recipient address: "${addr}" (must be a 0x-prefixed 40-character hex string)`);
    }
  }
  if (args.hours) {
    const [start, end] = args.hours;
    if (start < 0 || start > 23) errors.push(`--hours start (${start}) must be in range [0, 23]`);
    if (end < 1 || end > 24)   errors.push(`--hours end (${end}) must be in range [1, 24]`);
    if (start >= end)           errors.push(`--hours start (${start}) must be before end (${end})`);
  }

  if (errors.length > 0) {
    console.error("\n❌  Configuration errors:\n");
    for (const err of errors) {
      console.error(`   • ${err}`);
    }
    console.error();
    process.exit(1);
  }
}

// ─── Summary printer ──────────────────────────────────────────────────────────

function printSummary(args: ParsedArgs, env: ReturnType<typeof validateEnv>): void {
  const ensName = `${args.name}.${args.domain}`;
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          VCR Agent Setup — Configuration             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  ENS name          : ${ensName}`);
  console.log(`  Max per tx        : $${args.maxTx} USDC`);
  console.log(`  Daily limit       : $${args.daily} USDC`);
  console.log(`  Allowed recipients: ${args.recipients.length} address(es)`);
  for (const r of args.recipients) {
    console.log(`    • ${r}`);
  }
  console.log(`  Allowed tokens    : ${args.tokens.join(", ")}`);
  console.log(`  Allowed chains    : ${args.chains.join(", ")}`);
  if (args.hours) {
    console.log(`  Allowed hours     : ${args.hours[0]}:00 – ${args.hours[1]}:00 UTC`);
  } else {
    console.log(`  Allowed hours     : (no restriction)`);
  }
  if (args.description) {
    console.log(`  Description       : ${args.description}`);
  }
  console.log(`\n  BitGo env         : test (Hoodi testnet)`);
  console.log(`  ERC-8004 registry : Sepolia`);
  console.log(`  ENS resolver      : Sepolia`);
  console.log("\n  ⚠️  CRITICAL: BitGo policy rules lock 48 hours after wallet creation.");
  console.log("     All recipient addresses must be final BEFORE proceeding.");
  console.log("     You CANNOT add more recipients after the lock.");

  if (args.dryRun) {
    console.log("\n  🔍  DRY RUN — no transactions will be submitted.\n");
  }
  console.log();
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive (CI/piped): auto-confirm
    console.log(`${message} [auto-yes in non-interactive mode]`);
    return true;
  }

  process.stdout.write(`${message} (y/N): `);
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (chunk) => {
      input = String(chunk).trim().toLowerCase();
      resolve(input === "y" || input === "yes");
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const env  = validateEnv();
  validateArgs(args);

  printSummary(args, env);

  if (args.dryRun) {
    console.log("✅  Dry-run complete. No agent was created.");
    return;
  }

  const ok = await confirm("Proceed with agent creation?");
  if (!ok) {
    console.log("\nAborted.\n");
    process.exit(0);
  }

  console.log();

  const config: CreateAgentConfig = {
    name:               args.name,
    baseDomain:         args.domain,
    maxPerTxUsdc:       args.maxTx,
    dailyLimitUsdc:     args.daily,
    allowedRecipients:  args.recipients,
    allowedTokens:      args.tokens,
    allowedChains:      args.chains,
    allowedHours:       args.hours,
    description:        args.description,
  };

  try {
    const record = await createAgent(config, env);

    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║            ✅  Agent Created Successfully             ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");
    console.log(`  ENS name        : ${record.ensName}`);
    console.log(`  Agent ID        : ${record.agentId}`);
    console.log(`  Wallet ID       : ${record.walletId}`);
    console.log(`  Forwarder addr  : ${record.walletAddress}`);
    console.log(`  Policy CID      : ${record.policyCid}`);
    console.log(`  Policy hash     : ${record.policyHash.slice(0, 22)}…`);
    console.log(`  Registration tx : ${record.registrationTx}`);
    console.log(`  ENS tx          : ${record.ensTx}`);
    console.log(`  Created at      : ${record.createdAt}`);
    console.log(`\n  📁  Saved to     : agents/${args.name}.json`);
    console.log(`  🔑  Key saved to : agents/${args.name}.key  (mode 0600, git-ignored)`);
    console.log(`\n  ⚠️  The .key file contains your BitGo user private key.`);
    console.log(`     Back it up securely. It cannot be recovered from BitGo.`);
    console.log(`\n  Next steps:`);
    console.log(`    1. Verify the agent:  npm run demo`);
    console.log(`    2. canAgentSpend("${record.ensName}", { amount, token, recipient, chain })`);
    console.log(`    3. BitGo wallet is ready at: ${record.walletAddress}\n`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`\n❌  Agent creation failed:\n   ${message}\n`);

    // Provide actionable hints for common failures
    if (message.includes("gas tank")) {
      console.error("   💡  Fund the BitGo enterprise gas tank with Hoodi ETH.");
      console.error("       Faucet: https://hoodi-faucet.pk910.de\n");
    } else if (message.includes("BITGO_ACCESS_TOKEN")) {
      console.error("   💡  Check your BITGO_ACCESS_TOKEN in .env\n");
    } else if (message.includes("PINATA")) {
      console.error("   💡  Check your PINATA_JWT and PINATA_GATEWAY in .env\n");
    } else if (message.includes("ENS") || message.includes("resolver")) {
      console.error("   💡  Ensure PRIVATE_KEY owns the ENS domain and SEPOLIA_RPC_URL is set.\n");
    }

    process.exit(1);
  }
}

main();
