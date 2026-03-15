import "dotenv/config";
import { getWallet } from "../src/bitgo.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const walletId =
    args.walletId ??
    process.env.BITGO_WALLET_ID ??
    process.env.DEMO_BITGO_WALLET_ID;

  if (!walletId) {
    throw new Error(
      "Provide --walletId <id> or set BITGO_WALLET_ID / DEMO_BITGO_WALLET_ID",
    );
  }

  const wallet = await getWallet(walletId);
  const rawWallet = (wallet as any)?._wallet ?? {};
  const coinSpecific =
    typeof (wallet as any).coinSpecific === "function"
      ? (wallet as any).coinSpecific()
      : undefined;

  const walletType =
    rawWallet.type ??
    rawWallet.subType ??
    rawWallet.multisigType ??
    "unknown";

  console.log("BitGo Wallet Inspection");
  console.log("======================");
  console.log(`Wallet ID         : ${walletId}`);
  console.log(`Label             : ${rawWallet.label ?? "unknown"}`);
  console.log(`Coin              : ${rawWallet.coin ?? "hteth"}`);
  console.log(`Type              : ${rawWallet.type ?? "unknown"}`);
  console.log(`Subtype           : ${rawWallet.subType ?? "unknown"}`);
  console.log(`Multisig          : ${rawWallet.multisigType ?? "unknown"}`);
  console.log(`Wallet version    : ${rawWallet.walletVersion ?? "unknown"}`);
  console.log(`Receive address   : ${rawWallet.receiveAddress ?? "unknown"}`);
  console.log(`Base address      : ${coinSpecific?.baseAddress ?? "unknown"}`);
  console.log(
    `Pending init      : ${
      coinSpecific?.pendingChainInitialization ? "yes" : "no"
    }`,
  );
  console.log(
    `Custom root URI   : ${
      process.env.BITGO_CUSTOM_ROOT_URI ??
      process.env.BITGO_EXPRESS_URL ??
      "none"
    }`,
  );
  console.log("");

  if (isCustodyWallet(walletType)) {
    console.log("Assessment");
    console.log(
      "  This looks like a custody-style wallet. For a real testnet execution demo, create a fresh self-custody hot wallet or route through BitGo Express.",
    );
    return;
  }

  console.log("Assessment");
  console.log(
    "  This wallet looks compatible with a self-custody execution path. The next checks are unlock/auth configuration and available hteth funding.",
  );
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

function isCustodyWallet(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized.includes("cust") || normalized === "trading";
}

main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
});
