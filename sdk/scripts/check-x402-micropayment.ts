import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import {
  canAgentSpend,
  createSignedPaymentRequest,
  extractPolicyCid,
  fetchPolicy,
  getVCRPolicyUri,
  getWallet,
  parsePaymentSignatureHeader,
  X402_FACILITATOR,
  X402_HEADERS,
} from "../src/index.js";
import type {
  AgentRecord,
  DailySpentGetter,
  X402PaymentRequirement,
} from "../src/index.js";

const DEFAULT_ENS = "hoodi-small-002.vcrtcorp.eth";
const DEFAULT_RECIPIENT = "0x4C3F5a84041E562928394d63b3E339bE70DBcC17";
const DEFAULT_AMOUNT = "100000";
const DEFAULT_TOKEN = "USDC";
const DEFAULT_NETWORK = "base-sepolia";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ensName = args.ens ?? DEFAULT_ENS;
  const recipient = args.recipient ?? DEFAULT_RECIPIENT;
  const amount = args.amount ?? DEFAULT_AMOUNT;
  const token = args.token ?? DEFAULT_TOKEN;
  const network = args.network ?? DEFAULT_NETWORK;

  console.log("VCR x402 Micropayment Check");
  console.log("===========================");
  console.log(`Agent ENS        : ${ensName}`);
  console.log(`Recipient        : ${recipient}`);
  console.log(`Amount           : ${amount} (${formatUsdc(amount)} ${token})`);
  console.log(`Network          : ${network}`);
  console.log(`Facilitator      : ${X402_FACILITATOR}`);
  console.log("");

  const record = await loadAgentRecord(ensName);
  if (!record) {
    throw new Error(`No agent record found for ${ensName} in sdk/agents or server/agents`);
  }

  console.log("Agent record");
  console.log(`  Wallet ID      : ${record.walletId}`);
  console.log(`  Wallet address : ${record.walletAddress}`);
  console.log(`  Policy URI     : ${record.policyUri}`);
  console.log(`  Key captured   : ${record.bitgoUserKeyCaptured ? "yes" : "no"}`);
  console.log("");

  const policyUri = await getVCRPolicyUri(ensName);
  if (!policyUri) {
    throw new Error(`No vcr.policy ENS record found for ${ensName}`);
  }
  const policy = await fetchPolicy(policyUri);
  const policyCid = extractPolicyCid(policyUri);

  console.log("Live policy");
  console.log(`  ENS pointer    : ${policyUri}`);
  console.log(`  Policy CID     : ${policyCid}`);
  console.log(`  Max tx         : ${policy.constraints.maxTransaction.amount}`);
  console.log(`  Daily limit    : ${policy.constraints.dailyLimit.amount}`);
  console.log(`  Allowed chains : ${policy.constraints.allowedChains.join(", ")}`);
  console.log(`  Allowed tokens : ${policy.constraints.allowedTokens.join(", ")}`);
  console.log(`  Recipients     : ${policy.constraints.allowedRecipients.join(", ")}`);
  if (policy.constraints.timeRestrictions) {
    console.log(
      `  Allowed hours  : ${policy.constraints.timeRestrictions.allowedHours[0]}:00-${policy.constraints.timeRestrictions.allowedHours[1]}:00 UTC`,
    );
  } else {
    console.log("  Allowed hours  : unrestricted");
  }
  console.log("");

  const getDailySpent: DailySpentGetter = async () => "0";
  const preflight = await canAgentSpend(
    ensName,
    { amount, token, recipient, chain: network },
    getDailySpent,
  );

  console.log("VCR preflight");
  console.log(`  Allowed        : ${preflight.allowed ? "yes" : "no"}`);
  console.log(`  Reason         : ${preflight.reason ?? "passed"}`);
  console.log("");

  let wallet: any = null;
  try {
    wallet = await getWallet(record.walletId);
  } catch (error) {
    console.log("BitGo wallet access");
    console.log(`  Reachable       : no`);
    console.log(`  Error           : ${(error as Error).message}`);
    console.log("");
  }

  if (wallet) {
    const baseAddress =
      typeof wallet.coinSpecific === "function"
        ? wallet.coinSpecific()?.baseAddress
        : undefined;
    console.log("BitGo wallet access");
    console.log("  Reachable       : yes");
    console.log(`  Base address    : ${baseAddress ?? "unknown"}`);
    console.log(`  Forwarder       : ${record.walletAddress}`);
    console.log("");
  }

  const signerPrivateKey =
    process.env.X402_PAYER_PRIVATE_KEY ?? process.env.DEMO_X402_PRIVATE_KEY;

  console.log("x402 signer check");
  console.log(
    `  Private key     : ${signerPrivateKey ? "present via env" : "missing"}`,
  );
  console.log(
    `  BitGo key file  : ${await hasKeyFileForRecord(record) ? "present on disk" : "missing"}`,
  );
  console.log("");

  const capability = evaluateCapability({
    preflightAllowed: preflight.allowed,
    signerPrivateKeyPresent: Boolean(signerPrivateKey),
    record,
  });

  console.log("Conclusion");
  console.log(`  Real x402 now   : ${capability.canSendRealX402 ? "yes" : "no"}`);
  console.log(`  Why             : ${capability.reason}`);
  console.log("");

  if (!capability.canSendRealX402) {
    console.log("Next requirement");
    for (const line of capability.nextSteps) {
      console.log(`  - ${line}`);
    }
    return;
  }

  const requirement: X402PaymentRequirement = {
    price: amount,
    token,
    network,
    recipient,
    facilitator: X402_FACILITATOR,
  };

  console.log("Signing test");
  const signed = await createSignedPaymentRequest(requirement, {
    ensName,
    privateKey: signerPrivateKey!,
    chainId: 84532,
    usdcAddress: process.env.BASE_SEPOLIA_USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    getDailySpent,
  });
  const parsed = parsePaymentSignatureHeader(JSON.stringify(signed));

  console.log(`  Scheme          : ${signed.scheme}`);
  console.log(`  From            : ${signed.authorization.from}`);
  console.log(`  To              : ${signed.authorization.to}`);
  console.log(`  Header          : ${X402_HEADERS.PAYMENT_SIGNATURE}`);
  console.log(`  Parsed back     : ${parsed ? "yes" : "no"}`);
  console.log("");
  console.log("Ready for facilitator verification and settlement.");
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }

  return out;
}

async function loadAgentRecord(ensName: string): Promise<AgentRecord | null> {
  const candidates = [
    path.join(process.cwd(), "agents"),
    path.join(process.cwd(), "..", "server", "agents"),
  ];

  for (const directory of candidates) {
    const files = await fs.readdir(directory).catch(() => []);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fullPath = path.join(directory, file);
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw) as AgentRecord;
      if (parsed.ensName?.toLowerCase() === ensName.toLowerCase()) {
        return parsed;
      }
    }
  }

  return null;
}

async function hasKeyFileForRecord(record: AgentRecord): Promise<boolean> {
  const candidates = [
    path.join(process.cwd(), "agents", `${record.ensName.split(".")[0]}.key`),
    path.join(process.cwd(), "..", "server", "agents", `${record.ensName.split(".")[0]}.key`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function evaluateCapability(input: {
  preflightAllowed: boolean;
  signerPrivateKeyPresent: boolean;
  record: AgentRecord;
}) {
  if (!input.preflightAllowed) {
    return {
      canSendRealX402: false,
      reason: "The payment is blocked by the live VCR policy before signing.",
      nextSteps: [
        "Use a whitelisted recipient, allowed token and chain, and stay under the max transaction size.",
      ],
    };
  }

  if (!input.signerPrivateKeyPresent) {
    return {
      canSendRealX402: false,
      reason:
        "The SDK can simulate the x402 request, but there is no local EIP-3009 signer private key for this agent payment flow.",
      nextSteps: [
        "Provide X402_PAYER_PRIVATE_KEY or DEMO_X402_PRIVATE_KEY for the payer wallet.",
        "That signer must control a Base Sepolia wallet with USDC.",
        "The signer address also needs to be the address you want represented as the x402 payer.",
      ],
    };
  }

  if (!input.record.bitgoUserKeyCaptured) {
    return {
      canSendRealX402: true,
      reason:
        "A separate signer private key is available, so x402 signing is possible even though the BitGo user key was not captured.",
      nextSteps: [],
    };
  }

  return {
    canSendRealX402: true,
    reason: "A signer private key is available and the live VCR policy allows the payment.",
    nextSteps: [],
  };
}

function formatUsdc(amount: string): string {
  const value = Number(amount) / 1e6;
  return value.toFixed(4);
}

main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
});
