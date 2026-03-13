/**
 * VCR Protocol — API Key Connectivity Tests
 * Run: cd server && npx tsx scripts/test-keys.ts
 */
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OK  = "✅";
const FAIL = "❌";
const SKIP = "⚠️ ";

function pass(msg: string, detail = "") {
  console.log(`  ${OK}  ${msg}${detail ? `\n       ${detail}` : ""}`);
}
function fail(msg: string, detail = "") {
  console.log(`  ${FAIL}  ${msg}${detail ? `\n       ${detail}` : ""}`);
}
function skip(msg: string) {
  console.log(`  ${SKIP} ${msg}`);
}
function section(name: string) {
  console.log(`\n${"─".repeat(52)}\n  ${name}\n${"─".repeat(52)}`);
}

// ─── 1. Environment Variable Check ────────────────────────────────────────────

section("1 · Environment Variables");

const required = [
  "PINATA_JWT",
  "BITGO_ACCESS_TOKEN",
  "BITGO_ENTERPRISE_ID",
  "SEPOLIA_RPC_URL",
  "ALCHEMY_API_KEY",
  "PIMLICO_API_KEY",
] as const;

const optional = [
  "PRIVATE_KEY",
  "ENS_NAME",
  "BITGO_WALLET_ID",
  "BITGO_WALLET_PASSPHRASE",
  "PINATA_GATEWAY",
] as const;

let missingRequired = 0;
for (const key of required) {
  if (process.env[key]) {
    pass(key, `${process.env[key]!.slice(0, 16)}…`);
  } else {
    fail(`${key} — NOT SET`);
    missingRequired++;
  }
}
for (const key of optional) {
  if (process.env[key] && process.env[key] !== "0x") {
    pass(`${key} (optional)`, `${process.env[key]!.slice(0, 16)}…`);
  } else {
    skip(`${key} — not set (optional)`);
  }
}

// ─── 2. Pinata / IPFS ─────────────────────────────────────────────────────────

section("2 · Pinata — IPFS Pinning");

try {
  const { PinataSDK } = await import("pinata");
  const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY ?? "gateway.pinata.cloud",
  });

  // Test 1: list pins (lightweight auth check)
  const account = await (pinata as any).testAuthentication?.() ??
    await fetch("https://api.pinata.cloud/data/testAuthentication", {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    }).then(r => r.json());

  if (account?.message === "Congratulations! You are communicating with the Pinata API!") {
    pass("Authentication", account.message);
  } else {
    // Try direct fetch if SDK method not available
    const r = await fetch("https://api.pinata.cloud/data/testAuthentication", {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    });
    const body = await r.json() as { message?: string };
    if (r.ok) {
      pass("Authentication", body.message ?? "OK");
    } else {
      fail("Authentication", JSON.stringify(body));
    }
  }

  // Test 2: pin a tiny JSON
  const testPolicy = { test: true, ts: Date.now(), service: "VCR Protocol" };
  const pinResult = await pinata.upload.public.json(testPolicy);
  pass("Pin JSON", `CID: ${pinResult.cid}`);

  // Test 3: fetch it back via gateway
  const gateway = process.env.PINATA_GATEWAY ?? "gateway.pinata.cloud";
  const fetchUrl = `https://${gateway}/ipfs/${pinResult.cid}`;
  const fetchRes = await fetch(fetchUrl);
  if (fetchRes.ok) {
    pass("Gateway fetch", `${fetchUrl.slice(0, 60)}…`);
  } else {
    fail("Gateway fetch", `${fetchRes.status} — try setting PINATA_GATEWAY to your private gateway`);
  }
} catch (err: unknown) {
  fail("Pinata", (err as Error).message);
}

// ─── 3. Alchemy RPC ───────────────────────────────────────────────────────────

section("3 · Alchemy — Sepolia RPC");

try {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL!),
  });

  const blockNumber = await publicClient.getBlockNumber();
  pass("Connection", `Current block: ${blockNumber.toString()}`);

  // Check ERC-8004 IdentityRegistry exists
  const code = await publicClient.getBytecode({
    address: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  });
  if (code && code.length > 2) {
    pass("ERC-8004 IdentityRegistry (Sepolia)", "Contract found ✓");
  } else {
    fail("ERC-8004 IdentityRegistry (Sepolia)", "No bytecode — wrong address or network");
  }

  // Check ENS Public Resolver exists
  const resolverCode = await publicClient.getBytecode({
    address: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
  });
  if (resolverCode && resolverCode.length > 2) {
    pass("ENS Public Resolver (Sepolia)", "Contract found ✓");
  } else {
    fail("ENS Public Resolver (Sepolia)", "No bytecode");
  }
} catch (err: unknown) {
  fail("Alchemy RPC", (err as Error).message);
}

// ─── 4. BitGo ─────────────────────────────────────────────────────────────────

section("4 · BitGo — Test Environment");

try {
  const { BitGoAPI } = await import("@bitgo/sdk-api");

  const bitgo = new BitGoAPI({ env: "test" });
  bitgo.authenticateWithAccessToken({
    accessToken: process.env.BITGO_ACCESS_TOKEN!,
  });

  // Fetch current user to verify token
  const me = await (bitgo as any).me() as { username?: string; email?: string };
  pass("Authentication", `User: ${me?.email ?? me?.username ?? "authenticated"}`);

  // List wallets (enterprise check)
  try {
    const { Eth } = await import("@bitgo/sdk-coin-eth");
    bitgo.register("hteth", Eth.createInstance);
    const wallets = await bitgo.coin("hteth").wallets().list({});
    const count = (wallets as any)?.wallets?.length ?? 0;
    pass("Enterprise wallets (hteth)", `${count} wallets found`);
  } catch (e: unknown) {
    fail("Wallet list", (e as Error).message.slice(0, 80));
  }
} catch (err: unknown) {
  fail("BitGo", (err as Error).message.slice(0, 120));
}

// ─── 5. Pimlico ───────────────────────────────────────────────────────────────

section("5 · Pimlico — Account Abstraction");

try {
  const pimlicoKey = process.env.PIMLICO_API_KEY!;
  const url = `https://api.pimlico.io/v2/11155111/rpc?apikey=${pimlicoKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_supportedEntryPoints",
      params: [],
    }),
  });

  const body = await response.json() as { result?: string[]; error?: { message: string } };
  if (body.result) {
    pass("Connected (Sepolia)", `EntryPoint: ${body.result[0]?.slice(0, 20)}…`);
  } else {
    fail("Connection", body.error?.message ?? "Unknown error");
  }
} catch (err: unknown) {
  fail("Pimlico", (err as Error).message);
}

// ─── 6. x402 Facilitator ──────────────────────────────────────────────────────

section("6 · x402 Facilitator (Coinbase)");

try {
  const response = await fetch("https://x402.org", { method: "HEAD", signal: AbortSignal.timeout(5000) });
  if (response.ok || response.status === 405) {
    pass("x402.org reachable", `HTTP ${response.status}`);
  } else {
    skip(`x402.org returned ${response.status}`);
  }
} catch (err: unknown) {
  fail("x402.org", (err as Error).message);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(52)}`);
console.log(missingRequired === 0
  ? `  ${OK}  All required keys set. Services tested above.`
  : `  ${FAIL}  ${missingRequired} required key(s) missing — check output above.`
);
console.log("═".repeat(52));

if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "0x") {
  console.log(`\n  ℹ️   PRIVATE_KEY not set — ENS setText and ERC-8004 register`);
  console.log(`       calls will fail. Add a Sepolia-funded wallet to .env.`);
}
if (!process.env.PINATA_GATEWAY) {
  console.log(`\n  ℹ️   PINATA_GATEWAY not set — using public gateway.`);
  console.log(`       Set to your private Pinata gateway for better rate limits.`);
}
console.log();
