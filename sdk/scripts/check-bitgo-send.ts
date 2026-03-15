import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import {
  getWallet,
  sendTransaction,
  unlockBitGoSession,
} from "../src/index.js";
import type { AgentRecord } from "../src/index.js";

const DEFAULT_ENS = "hoodi-small-002.vcrtcorp.eth";
const DEFAULT_RECIPIENT = "0x4C3F5a84041E562928394d63b3E339bE70DBcC17";
const DEFAULT_AMOUNT_WEI = "1000000000000000";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ensName = args.ens ?? DEFAULT_ENS;
  const recipient = args.recipient ?? DEFAULT_RECIPIENT;
  const amountWei = args.amountWei ?? DEFAULT_AMOUNT_WEI;
  const execute = args.execute === "true";

  const record = await loadAgentRecord(ensName);
  if (!record) {
    throw new Error(`No agent record found for ${ensName}`);
  }

  const passphrase = args.passphrase ?? record.walletPassphrase;
  if (!passphrase) {
    throw new Error(`No wallet passphrase available for ${ensName}`);
  }

  console.log("BitGo Send Readiness Check");
  console.log("=========================");
  console.log(`Agent ENS        : ${ensName}`);
  console.log(`Wallet ID        : ${record.walletId}`);
  console.log(`Recipient        : ${recipient}`);
  console.log(`Amount           : ${amountWei} wei (${formatHteth(amountWei)} hteth)`);
  console.log(`Execute          : ${execute ? "yes" : "no"}`);
  console.log("");

  const wallet = await getWallet(record.walletId);
  const rawWallet = (wallet as any)?._wallet ?? {};
  const coinSpecific =
    typeof (wallet as any).coinSpecific === "function"
      ? (wallet as any).coinSpecific()
      : undefined;

  console.log("Wallet");
  console.log(`  Type           : ${rawWallet.type ?? "unknown"}`);
  console.log(`  Multisig       : ${rawWallet.multisigType ?? "unknown"}`);
  console.log(`  Base address   : ${coinSpecific?.baseAddress ?? "unknown"}`);
  console.log(`  Pending init   : ${coinSpecific?.pendingChainInitialization ? "yes" : "no"}`);
  console.log(
    `  Balance fields : spendable=${stringOrUnknown(rawWallet.spendableBalanceString)}, confirmed=${stringOrUnknown(rawWallet.confirmedBalanceString)}`,
  );
  console.log("");

  console.log("Unlock");
  let unlockWorked = false;
  try {
    const unlockResult = await unlockBitGoSession();
    unlockWorked = true;
    console.log(`  Status         : ok`);
    console.log(`  Response       : ${summarize(unlockResult)}`);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("already unlocked longer than you had requested")) {
      unlockWorked = true;
      console.log(`  Status         : ok`);
      console.log("  Response       : session was already unlocked");
    } else {
      console.log(`  Status         : failed`);
      console.log(`  Error          : ${message}`);
      console.log("");
      console.log("Conclusion");
      console.log("  Real sendMany  : no");
      console.log("  Why            : Could not unlock the BitGo session for spending.");
      return;
    }
  }

  console.log("");
  const spendableBalance = parseBigIntish(rawWallet.spendableBalanceString);
  if (spendableBalance !== null && spendableBalance < BigInt(amountWei)) {
    console.log("Funding");
    console.log(`  Status         : insufficient`);
    console.log(`  Spendable      : ${rawWallet.spendableBalanceString}`);
    console.log(`  Required       : ${amountWei}`);
    console.log("");
    console.log("Conclusion");
    console.log("  Real sendMany  : no");
    console.log("  Why            : The wallet session is ready, but the agent wallet has no spendable hteth.");
    return;
  }

  if (!execute) {
    console.log("Conclusion");
    console.log("  Real sendMany  : not attempted");
    console.log(
      `  Why            : Dry run completed. Unlock ${unlockWorked ? "succeeded" : "was skipped"}, so the next step is a live tiny transfer.`,
    );
    console.log("");
    console.log("Next step");
    console.log("  Re-run with --execute true to attempt the real hteth transfer.");
    return;
  }

  console.log("Live transfer");
  try {
    const result = await sendTransaction(
      record.walletId,
      recipient,
      amountWei,
      passphrase,
    );

    console.log(`  Status         : ${result.status}`);
    if (result.txid) {
      console.log(`  Txid           : ${result.txid}`);
    }
    if (result.pendingApproval) {
      console.log(`  Approval ID    : ${result.pendingApproval}`);
    }
    console.log("");
    console.log("Conclusion");
    console.log("  Real sendMany  : yes");
    console.log(`  Outcome        : ${result.status}`);
  } catch (error) {
    console.log(`  Status         : failed`);
    console.log(`  Error          : ${(error as Error).message}`);
    console.log("");
    console.log("Conclusion");
    console.log("  Real sendMany  : no");
    console.log("  Why            : unlock worked, but the transfer call still failed.");
  }
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

async function loadAgentRecord(ensName: string): Promise<(AgentRecord & { walletPassphrase?: string }) | null> {
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
      const parsed = JSON.parse(raw) as AgentRecord & { walletPassphrase?: string };
      if (parsed.ensName?.toLowerCase() === ensName.toLowerCase()) {
        return parsed;
      }
    }
  }

  return null;
}

function stringOrUnknown(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 4);
  return entries.map(([key, entry]) => `${key}=${String(entry)}`).join(", ");
}

function formatHteth(amountWei: string): string {
  const value = Number(amountWei) / 1e18;
  return value.toFixed(6);
}

function parseBigIntish(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
});
