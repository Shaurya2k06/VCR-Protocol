// ─── VCR Protocol SDK — Agent Lifecycle Orchestrator ─────────────────────────
// createAgent() wires together every step of agent creation in order:
//
//   1. Create BitGo wallet (Hoodi testnet)
//   2. Register the ERC-8004 agent NFT on Sepolia
//   3. Build the final VCR policy JSON document
//   4. Store the policy via Fileverse and obtain its IPFS URI
//   5. Bind ENS via ENSIP-25 text record + ENS contenthash
//   6. Link the BitGo wallet to ERC-8004 via EIP-712 signature
//   7. Write agents/<name>.json + agents/<name>.key to disk
//
// Key rules enforced here:
//   • Each agent gets its own unique ENS name — never shared
//   • BitGo amounts are in WEI, not USD/USDC
//   • userKeyPrv is written to disk before the function returns
//   • Policy rules lock 48 hours after wallet creation — all recipients must
//     be supplied upfront in allowedRecipients
//   • Fileverse stores the JSON policy, ENS contenthash points to the IPFS CID

import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PinataSDK } from "pinata";
import stringify from "json-stringify-deterministic";
import fs from "fs/promises";
import path from "path";

import { createAgentWallet } from "./bitgo.js";
import {
  buildAgentMetadataJson,
  registerAgent,
  setAgentURI,
  setAgentWallet,
  waitForAgentRegistration,
} from "./erc8004.js";
import { buildPolicyGatewayUrl, setAllENSRecords } from "./ens.js";
import { ERC8004_ADDRESSES } from "./erc8004.js";
import { buildPolicyNamespace, storePolicyDocument } from "./fileverse.js";
import type {
  CreateAgentConfig,
  AgentRecord,
  VCRPolicy,
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
    PIMLICO_API_KEY: string;
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
  process.env.PIMLICO_API_KEY     = env.PIMLICO_API_KEY;
  process.env.PRIVATE_KEY         = env.PRIVATE_KEY;
  process.env.SEPOLIA_RPC_URL     = env.SEPOLIA_RPC_URL;

  console.log(`\n🚀  Creating agent: ${config.name}`);

  const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

  // Each agent gets its own ENS name — never shared between agents
  const ensName = `${config.name}.${config.baseDomain}`;

  // ── Step 1: BitGo wallet ──────────────────────────────────────────────────
  console.log("1/5  Creating BitGo wallet (Hoodi testnet)…");

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
    true, // isTestnet
  );

  console.log(`   ✅  Wallet ID:          ${bitgoResult.walletId}`);
  console.log(`   ✅  Forwarder address:  ${bitgoResult.forwarderAddress}`);
  if (bitgoResult.userKeyPrv) {
    console.log(`   ⚠️   userKeyPrv (first 20 chars): ${bitgoResult.userKeyPrv.slice(0, 20)}…`);
  } else {
    console.log("   ⚠️   BitGo did not return userKeyPrv for this wallet creation flow");
  }
  console.log(`   ℹ️   Policy hash:        ${bitgoResult.policyHash.slice(0, 20)}…`);

  const allowedChains  = config.allowedChains  ?? ["base-sepolia"];
  const allowedTokens  = config.allowedTokens  ?? ["USDC"];
  const primaryChain   = allowedChains[0]!;

  // ── Step 2: Register on ERC-8004 ─────────────────────────────────────────
  console.log("2/5  Registering ERC-8004 agent NFT on Sepolia…");

  // Register first so the final ERC-8004 registration file can self-reference
  // its real on-chain agentId in the `registrations` section.
  const { txHash: regTxHash } = await registerAgent();

  const { agentId, txHash: registrationTx } =
    await waitForAgentRegistration(regTxHash);

  console.log(`   ✅  Agent ID: ${agentId}  (tx: ${registrationTx})`);

  // ── Step 3: Build the final policy document ───────────────────────────────
  console.log("3/5  Building final VCR policy document…");

  // USDC amounts use 6 decimals
  const maxTxUsdc   = parseUnits(config.maxPerTxUsdc,   6).toString();
  const dailyUsdc   = parseUnits(config.dailyLimitUsdc, 6).toString();

  const finalPolicy: VCRPolicy = {
    version:   "1.0",
    agentId:  `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}:${agentId}`,
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
    enforcement: {
      vcr_layer: true,
      bitgo_native_policies: bitgoResult.nativePoliciesSet,
      reason: bitgoResult.nativePoliciesSet
        ? undefined
        : "BitGo testnet does not support velocityLimit or advancedWhitelist rule types",
    },
  };

  // ── Step 4: Store the policy document via Fileverse ───────────────────────
  console.log("4/5  Storing policy JSON via Fileverse…");
  const policyNamespace = buildPolicyNamespace(config.name);
  const storedPolicy = await storePolicyDocument(finalPolicy, policyNamespace);
  const policyUri = storedPolicy.contentUri;
  const policyCid = policyUri.startsWith("ipfs://") ? policyUri.slice(7) : policyUri;
  const policyGatewayUrl = buildPolicyGatewayUrl(policyUri);
  console.log(`   ✅  Policy URI: ${policyUri}`);
  console.log(`   ✅  Gateway URL: ${policyGatewayUrl}`);
  console.log(`   ✅  Fileverse file ID: ${storedPolicy.fileId}`);

  // ── Step 4b: Finalize ERC-8004 agentURI with full registration metadata ──
  const agentCard = buildAgentMetadataJson(
    {
      name: config.name,
      description: config.description ?? `VCR-enabled agent: ${config.name}`,
      services: [{ name: "ens", endpoint: ensName }],
      x402Support: true,
      active: true,
      supportedTrust: ["erc8004-reputation", "vcr-policy"],
    },
    ERC8004_ADDRESSES.identityRegistry.sepolia,
    agentId,
    11155111,
  );

  const agentCardCid = await pinJson(
    agentCard,
    env.PINATA_JWT,
    env.PINATA_GATEWAY,
  );
  const agentCardUri = `ipfs://${agentCardCid}`;
  const agentUriTx = await setAgentURI(agentId, agentCardUri);
  console.log(`   ✅  ERC-8004 agentURI: ${agentCardUri}`);
  console.log(`   ✅  ERC-8004 setAgentURI tx: ${agentUriTx}`);

  // ── Step 5: Bind ENS via ENSIP-25 + contenthash ──────────────────────────
  console.log("5/5  Binding ENS via ENSIP-25 + contenthash…");
  const { txHash: ensTx } = await setAllENSRecords(
    ensName,
    agentId,
    policyUri,
  );
  console.log(`   ✅  ENS records set (tx: ${ensTx})`);

  // ── Bonus: Link BitGo wallet to ERC-8004 agent ────────────────────────────
  // On BitGo TSS wallets, signTypedData may recover to baseAddress rather than
  // a forwarder address. We try a deterministic candidate list to keep setup
  // warning-free while preserving forwarder usage in the policy.
  let linkedRegistryWalletAddress: `0x${string}` | undefined;
  console.log("    Linking BitGo wallet to ERC-8004 agent via EIP-712…");
  try {
    const { getWallet } = await import("./bitgo.js");
    const bitgoWallet = await getWallet(bitgoResult.walletId);

    const forwarder = bitgoResult.forwarderAddress.toLowerCase();
    const baseAddress = String(
      (bitgoWallet as any).coinSpecific?.().baseAddress ?? "",
    ).toLowerCase();
    const multisigType = String(
      (bitgoWallet as any)?._wallet?.multisigType ?? "",
    ).toLowerCase();

    const isHexAddress = (value: string): value is `0x${string}` =>
      /^0x[0-9a-f]{40}$/.test(value);

    const linkCandidates: `0x${string}`[] = [];
    // For TSS wallets, baseAddress is the signer that produces ECDSA sigs.
    if (multisigType === "tss" && isHexAddress(baseAddress)) {
      linkCandidates.push(baseAddress);
    }
    if (isHexAddress(forwarder) && !linkCandidates.includes(forwarder)) {
      linkCandidates.push(forwarder);
    }

    let lastError: Error | undefined;

    for (const candidate of linkCandidates) {
      try {
        await setAgentWallet(
          agentId,
          candidate,
          bitgoWallet as any,
          walletPassphrase,
        );
        linkedRegistryWalletAddress = candidate;
        break;
      } catch (err) {
        lastError = err as Error;
      }
    }

    if (!linkedRegistryWalletAddress) {
      throw (
        lastError ??
        new Error("No valid address candidates available for setAgentWallet")
      );
    }

    if (linkedRegistryWalletAddress.toLowerCase() === forwarder) {
      console.log(`   ✅  Agent wallet set to ${linkedRegistryWalletAddress}`);
    } else {
      console.log(
        `   ✅  Agent wallet set to BitGo signer ${linkedRegistryWalletAddress} (forwarder remains ${bitgoResult.forwarderAddress})`,
      );
    }
  } catch (err) {
    // Non-fatal: setup remains fully usable (ENS, policy, canAgentSpend, x402).
    console.log(
      `   ℹ️   Skipped optional setAgentWallet link: ${(err as Error).message}`,
    );
  }

  // ── Persist agent record ──────────────────────────────────────────────────
  const record: AgentRecord = {
    ensName,
    walletId:       bitgoResult.walletId,
    walletAddress:  bitgoResult.forwarderAddress,
    registryWalletAddress: linkedRegistryWalletAddress,
    agentId,
    erc8004AgentUri: agentCardUri,
    erc8004AgentUriTx: agentUriTx,
    policyCid,
    policyUri,
    policyGatewayUrl,
    policyFileId: storedPolicy.fileId,
    policyPortalAddress: storedPolicy.portalAddress,
    policyNamespace: storedPolicy.namespace,
    bitgoUserKeyCaptured: Boolean(bitgoResult.userKeyPrv),
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

  // Sensitive: plaintext user key — restricted file permissions, git-ignored.
  // BitGo only returns this once, and some test flows do not return it at all.
  if (bitgoResult.userKeyPrv) {
    await fs.writeFile(
      path.join("agents", `${config.name}.key`),
      bitgoResult.userKeyPrv,
      { mode: 0o600, encoding: "utf-8" },
    );
  }

  console.log(`\n✅  Agent "${config.name}" created successfully`);
  console.log(`    ENS:     ${ensName}`);
  console.log(`    AgentId: ${agentId}`);
  console.log(`    Policy:  ${policyUri}`);
  console.log(`    Gateway: ${policyGatewayUrl}`);
  console.log(`    Wallet:  ${bitgoResult.forwarderAddress}\n`);

  return record;
}
