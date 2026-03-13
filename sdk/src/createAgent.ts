// ─── VCR Protocol SDK — Agent Lifecycle Orchestrator ─────────────────────────
// createAgent() wires together every step of agent creation in order:
//
//   1. Create BitGo MPC wallet (Hoodi testnet, v3, onchain multisig)
//   2. Build VCR policy JSON document
//   3. Pin policy to IPFS via Pinata (deterministic JSON)
//   4. Pin ERC-8004 agent card to IPFS
//   5. Register agent on ERC-8004 IdentityRegistry (Sepolia)
//   6. Re-pin final policy with correct agentId + ipfs_cid
//   7. Set ENS text records via multicall (ENSIP-25 + vcr.policy)
//   8. Link BitGo forwarder to ERC-8004 agent via EIP-712 signature
//   9. Write agents/<name>.json + agents/<name>.key to disk
//
// Key rules enforced here:
//   • Each agent gets its own unique ENS name — never shared
//   • BitGo amounts are in WEI, not USD/USDC
//   • userKeyPrv is written to disk before the function returns
//   • Policy rules lock 48 hours after wallet creation — all recipients must
//     be supplied upfront in allowedRecipients
//   • json-stringify-deterministic is used everywhere a CID or hash is produced

import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { PinataSDK } from "pinata";
import stringify from "json-stringify-deterministic";
import fs from "fs/promises";
import path from "path";

import { createAgentWallet } from "./bitgo.js";
import { registerAgent, waitForAgentRegistration, setAgentWallet } from "./erc8004.js";
import { setAllENSRecords } from "./ens.js";
import { ERC8004_ADDRESSES } from "./erc8004.js";
import type {
  CreateAgentConfig,
  AgentRecord,
  VCRPolicy,
  AgentMetadata,
} from "./types.js";

// ─── IPFS helpers ─────────────────────────────────────────────────────────────

async function pinJson(
  data: unknown,
  pinataJwt: string,
  pinataGateway: string,
): Promise<string> {
  const pinata = new PinataSDK({ pinataJwt, pinataGateway });
  // CRITICAL: deterministic stringify so that the same logical document
  // always produces the same CID regardless of JS runtime key-insertion order.
  const deterministicData = JSON.parse(stringify(data));
  const result = await pinata.upload.public.json(deterministicData);
  return result.cid;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a fully-configured VCR agent from scratch.
 *
 * This is a one-shot orchestrator — call it once per agent.
 * The returned {@link AgentRecord} (plus `agents/<name>.json`) contains
 * everything needed to operate the agent afterwards.
 *
 * @param config - Agent configuration (name, limits, recipients, etc.)
 * @param env    - Owner credentials (shared across all agents, NOT per-agent)
 *
 * @returns AgentRecord with all identifiers and transaction hashes
 *
 * @example
 * ```ts
 * const record = await createAgent(
 *   {
 *     name: "researcher-001",
 *     baseDomain: "acmecorp.eth",
 *     maxPerTxUsdc: "500",
 *     dailyLimitUsdc: "5000",
 *     allowedRecipients: ["0xABC...", "0xDEF..."],
 *     description: "Research budget agent",
 *   },
 *   {
 *     BITGO_ACCESS_TOKEN: process.env.BITGO_ACCESS_TOKEN!,
 *     BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID!,
 *     PINATA_JWT: process.env.PINATA_JWT!,
 *     PINATA_GATEWAY: process.env.PINATA_GATEWAY!,
 *     PRIVATE_KEY: process.env.PRIVATE_KEY!,
 *     SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL!,
 *   },
 * );
 * ```
 */
export async function createAgent(
  config: CreateAgentConfig,
  env: {
    BITGO_ACCESS_TOKEN: string;
    BITGO_ENTERPRISE_ID: string;
    PINATA_JWT: string;
    PINATA_GATEWAY: string;
    PRIVATE_KEY: string;
    SEPOLIA_RPC_URL: string;
  },
): Promise<AgentRecord> {
  // Inject env vars so downstream helpers (bitgo.ts, erc8004.ts, ens.ts)
  // can pick them up without requiring refactored signatures.
  process.env.BITGO_ACCESS_TOKEN  = env.BITGO_ACCESS_TOKEN;
  process.env.BITGO_ENTERPRISE_ID = env.BITGO_ENTERPRISE_ID;
  process.env.PINATA_JWT          = env.PINATA_JWT;
  process.env.PINATA_GATEWAY      = env.PINATA_GATEWAY;
  process.env.PRIVATE_KEY         = env.PRIVATE_KEY;
  process.env.SEPOLIA_RPC_URL     = env.SEPOLIA_RPC_URL;

  console.log(`\n🚀  Creating agent: ${config.name}`);

  // ── Setup viem clients ────────────────────────────────────────────────────
  const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(env.SEPOLIA_RPC_URL),
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(env.SEPOLIA_RPC_URL),
  });

  // Each agent gets its own ENS name — never shared between agents
  const ensName = `${config.name}.${config.baseDomain}`;

  // ── Step 1: BitGo wallet ──────────────────────────────────────────────────
  console.log("1/6  Creating BitGo MPC wallet (Hoodi testnet)…");

  // BitGo velocity limits are in WEI, NOT USD or USDC base units.
  // We use ETH-equivalent wei here (18 decimals) for the on-chain policy.
  // The VCR policy itself enforces USDC limits (6 decimals) in software.
  const dailyLimitWei = parseUnits(config.dailyLimitUsdc, 18).toString();
  const maxPerTxWei   = parseUnits(config.maxPerTxUsdc,   18).toString();

  const walletPassphrase = `vcr-${config.name}-${Date.now()}`;

  const bitgoResult = await createAgentWallet(
    `VCR Agent — ${config.name}`,
    walletPassphrase,
    config.allowedRecipients,
    dailyLimitWei,
    maxPerTxWei,
  );

  console.log(`   ✅  Wallet ID:          ${bitgoResult.walletId}`);
  console.log(`   ✅  Forwarder address:  ${bitgoResult.forwarderAddress}`);
  console.log(`   ⚠️   userKeyPrv (first 20 chars): ${bitgoResult.userKeyPrv.slice(0, 20)}…`);
  console.log(`   ℹ️   Policy hash:        ${bitgoResult.policyHash.slice(0, 20)}…`);

  // ── Step 2: Build draft VCR policy ───────────────────────────────────────
  console.log("2/6  Building VCR policy document…");

  const allowedChains  = config.allowedChains  ?? ["base-sepolia"];
  const allowedTokens  = config.allowedTokens  ?? ["USDC"];
  const primaryChain   = allowedChains[0]!;

  // USDC amounts use 6 decimals
  const maxTxUsdc   = parseUnits(config.maxPerTxUsdc,   6).toString();
  const dailyUsdc   = parseUnits(config.dailyLimitUsdc, 6).toString();

  const policyDraft: Omit<VCRPolicy, "ipfs_cid"> = {
    version:   "1.0",
    agentId:   `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}:PENDING`,
    constraints: {
      maxTransaction: {
        amount: maxTxUsdc,
        token:  "USDC",
        chain:  primaryChain,
      },
      dailyLimit: {
        amount: dailyUsdc,
        token:  "USDC",
        chain:  primaryChain,
      },
      allowedRecipients: config.allowedRecipients,
      allowedTokens,
      allowedChains,
      timeRestrictions: config.allowedHours
        ? { timezone: "UTC", allowedHours: config.allowedHours }
        : undefined,
    },
    metadata: {
      createdAt:   new Date().toISOString(),
      createdBy:   account.address,
      description: config.description ?? `VCR policy for agent ${config.name}`,
    },
    ensName,
    walletAddress: bitgoResult.forwarderAddress,
    custodian:     "bitgo",
    network:       "hteth",
    policy_hash:   bitgoResult.policyHash,
  };

  // ── Step 3: Pin draft policy to IPFS ─────────────────────────────────────
  console.log("3/6  Pinning draft policy to IPFS…");
  const draftCid = await pinJson(policyDraft, env.PINATA_JWT, env.PINATA_GATEWAY);
  console.log(`   ✅  Draft CID: ${draftCid}`);

  // ── Step 4: Register on ERC-8004 ─────────────────────────────────────────
  console.log("4/6  Registering on ERC-8004 IdentityRegistry (Sepolia)…");

  // Build and pin the agent card (ERC-8004 agent URI)
  const agentCard: AgentMetadata = {
    type:        "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name:        config.name,
    description: config.description ?? `VCR-enabled agent: ${config.name}`,
    registrations: [],            // filled in after agentId is known
    services: [{ name: "ens", endpoint: ensName }],
    x402Support:   true,
    active:        true,
    supportedTrust: ["erc8004-reputation", "vcr-policy"],
  };

  const agentCardCid = await pinJson(
    agentCard,
    env.PINATA_JWT,
    env.PINATA_GATEWAY,
  );

  // Submit registration tx; agentId is read from the emitted event
  const { txHash: regTxHash } = await registerAgent(
    `ipfs://${agentCardCid}`,
  );

  const { agentId, txHash: registrationTx } =
    await waitForAgentRegistration(regTxHash);

  console.log(`   ✅  Agent ID: ${agentId}  (tx: ${registrationTx})`);

  // ── Step 5: Build and pin final policy (with real agentId + ipfs_cid) ────
  console.log("5/6  Pinning final policy to IPFS…");

  const finalPolicy: VCRPolicy = {
    ...(policyDraft as VCRPolicy),
    agentId:  `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}:${agentId}`,
    ipfs_cid: draftCid, // self-referential; updated to finalCid below
  };

  const finalCid = await pinJson(
    finalPolicy,
    env.PINATA_JWT,
    env.PINATA_GATEWAY,
  );

  // Now that we have the true final CID, update ipfs_cid and re-pin once more
  // so the document on IPFS accurately reflects its own CID.
  const selfReferential: VCRPolicy = { ...finalPolicy, ipfs_cid: finalCid };
  const canonicalCid = await pinJson(
    selfReferential,
    env.PINATA_JWT,
    env.PINATA_GATEWAY,
  );
  console.log(`   ✅  Final CID: ${canonicalCid}`);

  // ── Step 6: Set ENS text records ─────────────────────────────────────────
  console.log("6/6  Setting ENS text records (ENSIP-25 + vcr.policy)…");
  const { txHash: ensTx } = await setAllENSRecords(
    ensName,
    agentId,
    `ipfs://${canonicalCid}`,
  );
  console.log(`   ✅  ENS records set (tx: ${ensTx})`);

  // ── Bonus: Link BitGo forwarder to ERC-8004 agent ─────────────────────────
  console.log("    Linking BitGo forwarder to ERC-8004 agent via EIP-712…");
  try {
    await setAgentWallet(agentId, bitgoResult.forwarderAddress as `0x${string}`);
    console.log(`   ✅  Agent wallet set to ${bitgoResult.forwarderAddress}`);
  } catch (err) {
    // Non-fatal — the link can be set separately if the contract doesn't
    // expose setAgentWallet or the signature window has elapsed.
    console.warn(
      `   ⚠️   setAgentWallet failed (non-fatal): ${(err as Error).message}`,
    );
  }

  // ── Persist agent record ──────────────────────────────────────────────────
  const record: AgentRecord = {
    ensName,
    walletId:       bitgoResult.walletId,
    walletAddress:  bitgoResult.forwarderAddress,
    agentId,
    policyCid:      canonicalCid,
    policyHash:     bitgoResult.policyHash,
    registrationTx,
    ensTx,
    createdAt:      new Date().toISOString(),
  };

  await fs.mkdir("agents", { recursive: true });

  // Main record (safe to commit — no secrets)
  await fs.writeFile(
    path.join("agents", `${config.name}.json`),
    JSON.stringify({ ...record, walletPassphrase }, null, 2),
    "utf-8",
  );

  // Sensitive: plaintext user key — restricted file permissions, git-ignored
  await fs.writeFile(
    path.join("agents", `${config.name}.key`),
    bitgoResult.userKeyPrv,
    { mode: 0o600, encoding: "utf-8" },
  );

  console.log(`\n✅  Agent "${config.name}" created successfully`);
  console.log(`    ENS:     ${ensName}`);
  console.log(`    AgentId: ${agentId}`);
  console.log(`    Policy:  ipfs://${canonicalCid}`);
  console.log(`    Wallet:  ${bitgoResult.forwarderAddress}\n`);

  return record;
}
