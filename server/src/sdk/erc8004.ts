// ─── ERC-8004 Agent Registration ──────────────────────────────────────────────
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
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
  "function getOwner(uint256 agentId) external view returns (address)",
  "function getMetadata(uint256 agentId, string memory key) external view returns (string)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes memory signature) external",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI)",
]);

const reputationRegistryAbi = parseAbi([
  "function giveFeedback(uint256 agentId, uint256 score, string memory comment) external",
  "function getSummary(uint256 agentId) external view returns (uint256 totalScore, uint256 count)",
]);

// ─── Viem Clients ─────────────────────────────────────────────────────────────

function getPublicClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set");
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

function getWalletClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!rpcUrl || !privateKey) throw new Error("SEPOLIA_RPC_URL and PRIVATE_KEY must be set");
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
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
export async function registerAgent(agentUri: string): Promise<{ txHash: string }> {
  const walletClient = getWalletClient();

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
export async function waitForAgentRegistration(txHash: string): Promise<RegistrationResult> {
  const publicClient = getPublicClient();

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

  // Parse the AgentRegistered event from logs
  // Event: AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI)
  // topics[0] = event signature hash, topics[1] = agentId, topics[2] = owner
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === ERC8004_ADDRESSES.identityRegistry.sepolia.toLowerCase() &&
      log.topics.length >= 2
    ) {
      const agentId = Number(BigInt(log.topics[1]!));
      return {
        txHash,
        agentId,
        agentUri: "",
      };
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
    functionName: "getOwner",
    args: [BigInt(agentId)],
  }) as Promise<Address>;
}

/**
 * Set a metadata key/value on an agent (e.g., "agentWallet").
 */
export async function setAgentMetadata(
  agentId: number,
  key: string,
  value: string
): Promise<string> {
  const walletClient = getWalletClient();

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
 * The deadline is a Unix timestamp (max 5 minutes in the future).
 */
export async function setAgentWallet(
  agentId: number,
  newWallet: Address,
  deadlineSeconds = 300
): Promise<string> {
  const walletClient = getWalletClient();
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const publicClient = getPublicClient();

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  // EIP-712 typed data
  const domain = {
    name: "ERC8004IdentityRegistry",
    version: "1",
    chainId: 11155111,
    verifyingContract: ERC8004_ADDRESSES.identityRegistry.sepolia,
  };

  const types = {
    AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    agentId: BigInt(agentId),
    newWallet,
    owner: account.address,
    deadline,
  };

  const signature = await walletClient.signTypedData({ domain, types, primaryType: "AgentWalletSet", message });

  const txHash = await walletClient.writeContract({
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
export async function getAgentReputation(agentId: number): Promise<ReputationSummary> {
  const publicClient = getPublicClient();
  const [totalScore, count] = await publicClient.readContract({
    address: ERC8004_ADDRESSES.reputationRegistry.sepolia,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [BigInt(agentId)],
  }) as [bigint, bigint];

  const averageScore = count > 0n ? Number(totalScore) / Number(count) / 1e18 : 0;
  return { totalScore, count, averageScore };
}

/**
 * Build the ERC-8004 Agent URI JSON for IPFS upload.
 */
export function buildAgentMetadataJson(
  meta: Omit<AgentMetadata, "type">,
  registryAddress: string,
  agentId: number,
  chainId = 11155111
): AgentMetadata {
  return {
    type: "autonomous-agent",
    ...meta,
    registrations: [
      {
        chain: `eip155:${chainId}`,
        registry: registryAddress,
        agentId,
      },
    ],
    supportedTrust: ["erc8004-reputation", "vcr-policy"],
  };
}
