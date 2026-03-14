import { getWalletClient } from "./client.js";

// ─── ERC-8004 Agent Registration ──────────────────────────────────────────────
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  decodeEventLog,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { AgentMetadata } from "./types.js";

// ─── Contract Addresses ───────────────────────────────────────────────────────

export const ERC8004_ADDRESSES = {
  identityRegistry: {
    mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
    sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  },
  reputationRegistry: {
    mainnet: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
    sepolia: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  },
} as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const identityRegistryAbi = parseAbi([
  "function register() external returns (uint256)",
  "function register(string memory agentURI) external returns (uint256)",
  "function register(string memory agentURI, bytes memory metadata) external returns (uint256)",
  "function setMetadata(uint256 agentId, string memory key, string memory value) external",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function getOwner(uint256 agentId) external view returns (address)",
  "function getMetadata(uint256 agentId, string memory key) external view returns (string)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes memory signature) external",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI)",
]);

const reputationRegistryAbi = parseAbi([
  "function giveFeedback(uint256 agentId, uint256 score, string memory comment) external",
  "function getSummary(uint256 agentId) external view returns (uint256 totalScore, uint256 count)",
]);

const erc721TransferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// ─── Viem Clients ─────────────────────────────────────────────────────────────

function getPublicClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set");
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}


// ─── Registration ─────────────────────────────────────────────────────────────

export interface RegistrationResult {
  txHash: string;
  agentId: number;
  agentUri: string;
}

/**
 * Register an agent on ERC-8004 IdentityRegistry (Sepolia testnet).
 * Returns the transaction hash — agentId must be read from the event log
 * after the transaction confirms.
 */
export async function registerAgent(
  agentUri: string,
): Promise<{ txHash: string }> {
  const walletClient = await getWalletClient();

  const txHash = await walletClient.writeContract({
    address: ERC8004_ADDRESSES.identityRegistry.sepolia,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [agentUri],
  });

  return { txHash };
}

/**
 * Wait for a registration transaction and return the agentId from the event.
 */
export async function waitForAgentRegistration(
  txHash: string,
): Promise<RegistrationResult> {
  const publicClient = getPublicClient();

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ERC8004_ADDRESSES.identityRegistry.sepolia.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: identityRegistryAbi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "AgentRegistered") {
        continue;
      }

      const agentId = Number((decoded.args as { agentId: bigint }).agentId);
      return {
        txHash,
        agentId,
        agentUri: (decoded.args as { agentURI?: string }).agentURI ?? "",
      };
    } catch {
      // Keep scanning logs until the actual AgentRegistered event is found.
    }
  }

  // Fallback: ERC-8004 mints ERC-721 tokens, so a successful registration must
  // also emit Transfer(address(0), owner, tokenId). Use that tokenId if the
  // custom AgentRegistered event shape drifts from the local ABI.
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ERC8004_ADDRESSES.identityRegistry.sepolia.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: erc721TransferAbi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "Transfer") {
        continue;
      }

      const args = decoded.args as { from: Address; tokenId: bigint };
      if (args.from.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        continue;
      }

      return {
        txHash,
        agentId: Number(args.tokenId),
        agentUri: "",
      };
    } catch {
      // Ignore unrelated logs.
    }
  }

  throw new Error("AgentRegistered event not found in transaction receipt");
}

/**
 * Get the owner of an agent.
 */
export async function getAgentOwner(agentId: number): Promise<Address> {
  const publicClient = getPublicClient();
  return publicClient.readContract({
    address: ERC8004_ADDRESSES.identityRegistry.sepolia,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [BigInt(agentId)],
  }) as Promise<Address>;
}

/**
 * Set a metadata key/value on an agent (e.g., "agentWallet").
 */
export async function setAgentMetadata(
  agentId: number,
  key: string,
  value: string,
): Promise<string> {
  const walletClient = await getWalletClient();

  const txHash = await walletClient.writeContract({
    address: ERC8004_ADDRESSES.identityRegistry.sepolia,
    abi: identityRegistryAbi,
    functionName: "setMetadata",
    args: [BigInt(agentId), key, value],
  });

  return txHash;
}

/**
 * Set the agent's wallet address via EIP-712 signature.
 *
 * Per ERC-8004, the signature must be produced by `newWallet` (the BitGo
 * forwarder), NOT by the owner's EOA. Pass the BitGo Wallet object as
 * `newWalletSigner` so this function can call wallet.signTypedData() which
 * routes signing through the BitGo TSS key-share ceremony server-side.
 *
 * If `newWalletSigner` is not provided the function falls back to signing
 * with the owner key — this will be rejected by any contract that enforces
 * full ERC-8004 compliance, but is accepted by lenient deployments.
 *
 * @param agentId         - The ERC-8004 agent token ID
 * @param newWallet       - The forwarder / custodial wallet address to link
 * @param newWalletSigner - BitGo Wallet object whose key will produce the sig
 * @param walletPassphrase - BitGo wallet passphrase (needed for non-TSS wallets)
 * @param deadlineSeconds - Seconds from now for the EIP-712 deadline (max 300)
 */
export async function setAgentWallet(
  agentId: number,
  newWallet: Address,
  newWalletSigner?: { signTypedData: (params: { typedData: { typedDataRaw: string; version: string } }) => Promise<{ signature: string }> },
  walletPassphrase?: string,
  deadlineSeconds = 60,
): Promise<string> {
  const txWalletClient = await getWalletClient();
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  // ERC-8004 enforces: deadline must be <= block.timestamp + 5 minutes
  // Use a conservative 60-second window.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.min(deadlineSeconds, 300));

  // EIP-712 typed data definition (matches the on-chain DOMAIN_SEPARATOR)
  const domain = {
    name: "ERC8004IdentityRegistry",
    version: "1",
    chainId: 11155111,
    verifyingContract: ERC8004_ADDRESSES.identityRegistry.sepolia as string,
  };

  const types = {
    EIP712Domain: [
      { name: "name",              type: "string"  },
      { name: "version",           type: "string"  },
      { name: "chainId",           type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    AgentWalletSet: [
      { name: "agentId",   type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner",     type: "address" },
      { name: "deadline",  type: "uint256" },
    ],
  };

  const messageObj = {
    agentId:   agentId.toString(),   // JSON-safe; BitGo serialises as string
    newWallet: newWallet.toLowerCase(),
    owner:     account.address.toLowerCase(),
    deadline:  deadline.toString(),
  };

  let signature: string;

  if (newWalletSigner) {
    // ── Path A: sign with the BitGo forwarder wallet (TSS, server-side) ────
    // typedDataRaw must be a JSON string of the full EIP-712 message object.
    const typedDataRaw = JSON.stringify({
      types,
      primaryType: "AgentWalletSet",
      domain,
      message: messageObj,
    });

    const result = await newWalletSigner.signTypedData({
      typedData: {
        typedDataRaw,
        version: "V4",
        ...(walletPassphrase ? { walletPassphrase } : {}),
      },
    });

    signature = result.signature;
  } else {
    // ── Path B: fallback — sign with owner EOA (may be rejected on-chain) ──
    // Only accepted by deployments that do owner-based verification.
    signature = await txWalletClient.signTypedData({
      domain: {
        name:              domain.name,
        version:           domain.version,
        chainId:           domain.chainId,
        verifyingContract: domain.verifyingContract as `0x${string}`,
      },
      types: {
        AgentWalletSet: types.AgentWalletSet,
      },
      primaryType: "AgentWalletSet",
      message: {
        agentId:   BigInt(agentId),
        newWallet,
        owner:     account.address,
        deadline,
      },
    });
  }

  const txHash = await txWalletClient.writeContract({
    address: ERC8004_ADDRESSES.identityRegistry.sepolia,
    abi: identityRegistryAbi,
    functionName: "setAgentWallet",
    args: [BigInt(agentId), newWallet, deadline, signature as `0x${string}`],
  });

  return txHash;
}

// ─── Reputation ───────────────────────────────────────────────────────────────

export interface ReputationSummary {
  totalScore: bigint;
  count: bigint;
  averageScore: number;
}

/**
 * Get the reputation summary for an agent.
 */
export async function getAgentReputation(
  agentId: number,
): Promise<ReputationSummary> {
  const publicClient = getPublicClient();
  const [totalScore, count] = (await publicClient.readContract({
    address: ERC8004_ADDRESSES.reputationRegistry.sepolia,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [BigInt(agentId)],
  })) as [bigint, bigint];

  const averageScore =
    count > 0n ? Number(totalScore) / Number(count) / 1e18 : 0;
  return { totalScore, count, averageScore };
}

/**
 * Build the ERC-8004 Agent URI JSON for IPFS upload.
 * Conforms to the official ERC-8004 registration file format:
 * https://eips.ethereum.org/EIPS/eip-8004#agent-uri-and-agent-registration-file
 */
export function buildAgentMetadataJson(
  meta: Omit<AgentMetadata, "type">,
  registryAddress: string,
  agentId: number,
  chainId = 11155111,
): AgentMetadata {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    ...meta,
    registrations: [
      {
        agentRegistry: `eip155:${chainId}:${registryAddress}`,
        agentId,
      },
    ],
    supportedTrust: ["reputation", "vcr-policy"],
  };
}
