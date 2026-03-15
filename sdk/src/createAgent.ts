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
import {
  buildPolicyGatewayUrl,
  provisionAgentENSBinding,
  resolveENSConfig,
} from "./ens.js";
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

function emitCreateAgentLog(
  message: string,
  logger?: (message: string) => void,
): void {
  console.log(message);
  logger?.(message);
}

function logCreateAgent(message: string, logger?: (message: string) => void): void {
  emitCreateAgentLog(`[createAgent] ${message}`, logger);
}

function logCreateAgentDetail(message: string, logger?: (message: string) => void): void {
  emitCreateAgentLog(`  ${message}`, logger);
}

function resolveTokenDecimals(token: string): number {
  const normalized = token.toLowerCase();
  if (normalized === "usdc" || normalized === "usdt") {
    return 6;
  }

  return 18;
}

async function withCreateAgentProgressLog<T>(
  message: string,
  promise: Promise<T>,
  logger?: (message: string) => void,
  intervalMs = 15_000,
): Promise<T> {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    logCreateAgentDetail(`${message} (${elapsedSeconds}s elapsed)`, logger);
  }, intervalMs);

  try {
    return await promise;
  } finally {
    clearInterval(timer);
  }
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
  options?: {
    logger?: (message: string) => void;
    skipEnsBinding?: boolean;
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

  console.log("");
  logCreateAgent(`Creating agent "${config.name}"`, options?.logger);

  const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

  const ensConfig = resolveENSConfig(config, account.address);
  const ensName = ensConfig.ensName;

  // ── Step 1: BitGo wallet ──────────────────────────────────────────────────
  emitCreateAgentLog("[1/5] Creating BitGo wallet (Hoodi testnet)", options?.logger);

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

  logCreateAgentDetail(`Wallet ID: ${bitgoResult.walletId}`, options?.logger);
  logCreateAgentDetail(`Forwarder address: ${bitgoResult.forwarderAddress}`, options?.logger);
  if (bitgoResult.userKeyPrv) {
    logCreateAgentDetail(
      `Captured userKeyPrv once (first 20 chars): ${bitgoResult.userKeyPrv.slice(0, 20)}...`,
      options?.logger,
    );
  } else {
    logCreateAgentDetail(
      "BitGo did not return userKeyPrv for this wallet creation flow",
      options?.logger,
    );
  }
  logCreateAgentDetail(`Policy hash: ${bitgoResult.policyHash}`, options?.logger);

  const allowedChains  = config.allowedChains  ?? ["base-sepolia"];
  const allowedTokens  = config.allowedTokens  ?? ["USDC"];
  const primaryChain   = allowedChains[0]!;
  const primaryToken   = allowedTokens[0]!;

  // ── Step 2: Register on ERC-8004 ─────────────────────────────────────────
  emitCreateAgentLog("[2/5] Registering ERC-8004 agent NFT on Sepolia", options?.logger);

  // Register first so the final ERC-8004 registration file can self-reference
  // its real on-chain agentId in the `registrations` section.
  logCreateAgentDetail("Submitting register() transaction...", options?.logger);
  const { txHash: regTxHash } = await withCreateAgentProgressLog(
    "Waiting for ERC-8004 register() transaction hash",
    registerAgent(),
    options?.logger,
  );
  logCreateAgentDetail(`register() tx submitted: ${regTxHash}`, options?.logger);
  logCreateAgentDetail(
    "Waiting for ERC-8004 registration receipt and AgentRegistered event...",
    options?.logger,
  );

  const { agentId, txHash: registrationTx } =
    await withCreateAgentProgressLog(
      "Still waiting for ERC-8004 registration confirmation",
      waitForAgentRegistration(regTxHash),
      options?.logger,
    );

  logCreateAgentDetail(`Agent ID: ${agentId}`, options?.logger);
  logCreateAgentDetail(`ERC-8004 registration confirmed: ${registrationTx}`, options?.logger);

  // ── Step 3: Build the final policy document ───────────────────────────────
  emitCreateAgentLog("[3/5] Building final VCR policy document", options?.logger);

  const policyTokenDecimals = resolveTokenDecimals(primaryToken);
  const maxTxAmount = parseUnits(config.maxPerTxUsdc, policyTokenDecimals).toString();
  const dailyAmount = parseUnits(config.dailyLimitUsdc, policyTokenDecimals).toString();

  const finalPolicy: VCRPolicy = {
    version:   "1.0",
    agentId:  `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}:${agentId}`,
    constraints: {
      maxTransaction: {
        amount: maxTxAmount,
        token:  primaryToken,
        chain:  primaryChain,
      },
      dailyLimit: {
        amount: dailyAmount,
        token:  primaryToken,
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
  emitCreateAgentLog("[4/5] Storing policy JSON via Fileverse", options?.logger);
  const policyNamespace = buildPolicyNamespace(config.name);
  logCreateAgentDetail(`Fileverse namespace: ${policyNamespace}`, options?.logger);
  const storedPolicy = await withCreateAgentProgressLog(
    "Still waiting for Fileverse policy storage",
    storePolicyDocument(finalPolicy, policyNamespace),
    options?.logger,
  );
  const policyUri = storedPolicy.contentUri;
  const policyCid = policyUri.startsWith("ipfs://") ? policyUri.slice(7) : policyUri;
  const policyGatewayUrl = storedPolicy.viewerUrl ?? buildPolicyGatewayUrl(policyUri);
  logCreateAgentDetail(`Policy URI: ${policyUri}`, options?.logger);
  logCreateAgentDetail(`Gateway URL: ${policyGatewayUrl}`, options?.logger);
  logCreateAgentDetail(`Fileverse file ID: ${storedPolicy.fileId}`, options?.logger);

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

  logCreateAgentDetail("Pinning final ERC-8004 agent card...", options?.logger);
  const agentCardCid = await pinJson(
    agentCard,
    env.PINATA_JWT,
    env.PINATA_GATEWAY,
  );
  const agentCardUri = `ipfs://${agentCardCid}`;
  logCreateAgentDetail(`Pinned ERC-8004 agent card: ${agentCardUri}`, options?.logger);
  logCreateAgentDetail(`Submitting setAgentURI(${agentId})...`, options?.logger);
  const agentUriTx = await withCreateAgentProgressLog(
    "Waiting for setAgentURI transaction hash",
    setAgentURI(agentId, agentCardUri),
    options?.logger,
  );
  logCreateAgentDetail(`ERC-8004 setAgentURI tx: ${agentUriTx}`, options?.logger);

  // ── Step 5: Bind ENS via ENSIP-25 + contenthash ──────────────────────────
  let ensTx = "";
  if (options?.skipEnsBinding) {
    emitCreateAgentLog("[5/5] Deferring ENS binding to the connected wallet", options?.logger);
    logCreateAgentDetail(`ENS name: ${ensName}`, options?.logger);
    logCreateAgentDetail(`Policy URI for ENS: ${policyUri}`, options?.logger);
    logCreateAgentDetail(
      "Skipping backend ENS write so the frontend wallet can submit the self-owned ENS transactions.",
      options?.logger,
    );
  } else {
    emitCreateAgentLog("[5/5] Binding ENS via ENSIP-25 + contenthash", options?.logger);
    logCreateAgentDetail(`ENS name: ${ensName}`, options?.logger);
    logCreateAgentDetail(`Policy URI for ENS: ${policyUri}`, options?.logger);
    const ensResult = await provisionAgentENSBinding(
      ensName,
      agentId,
      policyUri,
      undefined,
      undefined,
      {
        mode: ensConfig.mode,
        managerAddress: ensConfig.managerAddress,
        ownerAddress: ensConfig.ownerAddress,
        registrationYears: ensConfig.registrationYears,
      },
    );
    ensTx = ensResult.txHash;
    logCreateAgentDetail(`ENS records set tx: ${ensTx}`, options?.logger);
  }

  // ── Bonus: Link BitGo wallet to ERC-8004 agent ────────────────────────────
  // On BitGo TSS wallets, signTypedData may recover to baseAddress rather than
  // a forwarder address. We try a deterministic candidate list to keep setup
  // warning-free while preserving forwarder usage in the policy.
  let linkedRegistryWalletAddress: `0x${string}` | undefined;
  logCreateAgentDetail("Linking BitGo wallet to ERC-8004 agent via EIP-712...", options?.logger);
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
      logCreateAgentDetail(`Agent wallet set to ${linkedRegistryWalletAddress}`, options?.logger);
    } else {
      logCreateAgentDetail(
        `Agent wallet set to BitGo signer ${linkedRegistryWalletAddress} (forwarder remains ${bitgoResult.forwarderAddress})`,
        options?.logger,
      );
    }
  } catch (err) {
    // Non-fatal: setup remains fully usable (ENS, policy, canAgentSpend, x402).
    logCreateAgentDetail(
      `Skipped optional setAgentWallet link: ${(err as Error).message}`,
      options?.logger,
    );
  }

  // ── Persist agent record ──────────────────────────────────────────────────
  const record: AgentRecord = {
    ensName,
    ensMode: ensConfig.mode,
    ensManagerAddress: ensConfig.managerAddress,
    ensOwnerAddress: ensConfig.ownerAddress,
    ensRegistrationYears: ensConfig.registrationYears,
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
  logCreateAgentDetail("Persisting agent record to agents/...", options?.logger);

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

  console.log("");
  logCreateAgent(`Agent "${config.name}" created successfully`, options?.logger);
  logCreateAgentDetail(`ENS: ${ensName}`, options?.logger);
  logCreateAgentDetail(`AgentId: ${agentId}`, options?.logger);
  logCreateAgentDetail(`Policy: ${policyUri}`, options?.logger);
  logCreateAgentDetail(`Gateway: ${policyGatewayUrl}`, options?.logger);
  logCreateAgentDetail(`Wallet: ${bitgoResult.forwarderAddress}`, options?.logger);
  console.log("");

  return record;
}
