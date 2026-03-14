#!/usr/bin/env tsx
import "dotenv/config";
import { parseUnits } from "viem";
import { updateAgentPolicy } from "../src/updateAgentPolicy.js";
import type { VCRConstraints } from "../src/types.js";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function getAll(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      values.push(process.argv[i + 1]!);
    }
  }
  return values;
}

async function main() {
  const recordPath = getArg("--record");
  const maxTx = getArg("--max-tx");
  const daily = getArg("--daily");
  const description = getArg("--description");
  const recipients = getAll("--recipient");
  const tokens = getAll("--token");
  const chains = getAll("--chain");

  if (!recordPath || !maxTx || !daily || recipients.length === 0) {
    console.error(
      "Usage: tsx scripts/update-policy.ts --record agents/<name>.json --max-tx 1 --daily 2 --recipient 0x... [--token USDC] [--chain base-sepolia]",
    );
    process.exit(1);
  }

  const constraints: VCRConstraints = {
    maxTransaction: {
      amount: parseUnits(maxTx, 6).toString(),
      token: tokens[0] ?? "USDC",
      chain: chains[0] ?? "base-sepolia",
    },
    dailyLimit: {
      amount: parseUnits(daily, 6).toString(),
      token: tokens[0] ?? "USDC",
      chain: chains[0] ?? "base-sepolia",
    },
    allowedRecipients: recipients,
    allowedTokens: tokens.length ? tokens : ["USDC"],
    allowedChains: chains.length ? chains : ["base-sepolia"],
  };

  const updated = await updateAgentPolicy({
    recordPath,
    constraints,
    description,
  });

  console.log(`Updated policy for ${updated.ensName}`);
  console.log(`New policy URI: ${updated.policyUri}`);
  console.log(`Gateway URL: ${updated.policyGatewayUrl ?? "n/a"}`);
  console.log(`History versions: ${updated.policyVersions?.length ?? 0}`);
}

main();
