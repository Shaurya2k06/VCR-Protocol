// ─── ENS Integration — ENSIP-25 + VCR Policy Text Records ────────────────────
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { sepolia } from "viem/chains";
import { normalize, namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";
import type { ENSSetResult } from "./types.js";

// ─── Contract Addresses ───────────────────────────────────────────────────────

export const ENS_ADDRESSES = {
  registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const,
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as const,
  publicResolverMainnet: "0xF29100983E058B709F3D539b0c765937B804AC15" as const,
  publicResolverSepolia: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const,
} as const;

// ERC-8004 IdentityRegistry — Sepolia testnet
export const ERC8004_REGISTRY_SEPOLIA = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

/**
 * Encode an EVM address + chainId into ERC-7930 binary format.
 * Used to build the ENSIP-25 agent-registration text record key.
 *
 * Official binary format (from ERC-7930 spec):
 *   Version          (2 bytes, big-endian) = 0x0001
 *   ChainType        (2 bytes, big-endian) = 0x0000 for EVM
 *   ChainRefLength   (1 byte)              = minimal bytes for chainId
 *   ChainReference   (variable)            = chainId as big-endian bytes
 *   AddressLength    (1 byte)              = 0x14 (20 bytes)
 *   Address          (20 bytes)
 *
 * Validated against ENSIP-25 official example:
 *   encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")
 *   → "0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432"
 */
export function encodeERC7930(chainId: number, address: string): string {
  const addrHex = address.replace(/^0x/i, "").toLowerCase().padStart(40, "0");

  // Encode chainId as big-endian minimal bytes
  const chainRefBytes = chainIdToMinimalBytes(chainId);
  const chainRefLen = chainRefBytes.length;
  const chainRefHex = chainRefBytes.map((b) => b.toString(16).padStart(2, "0")).join("");

  const version = "0001";          // Version 1 (2 bytes)
  const chainType = "0000";        // EVM chain type (2 bytes)
  const chainRefLenHex = chainRefLen.toString(16).padStart(2, "0");
  const addrLen = "14";            // 20 bytes

  return `0x${version}${chainType}${chainRefLenHex}${chainRefHex}${addrLen}${addrHex}`;
}

/**
 * Convert a chain ID to its minimal big-endian byte representation.
 * e.g. chainId=1 → [0x01], chainId=11155111 → [0xaa, 0x36, 0xa7]
 */
function chainIdToMinimalBytes(chainId: number): number[] {
  if (chainId === 0) return [0x00];
  const bytes: number[] = [];
  let n = chainId;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = n >>> 8;
  }
  return bytes;
}

/**
 * Build the ENSIP-25 agent-registration text record key.
 *
 * For Sepolia: registryAddress = ERC8004_REGISTRY_SEPOLIA, chainId = 11155111
 */
export function buildAgentRegistrationKey(
  registryAddress: string,
  chainId: number,
  agentId: number
): string {
  const encoded = encodeERC7930(chainId, registryAddress);
  return `agent-registration[${encoded}][${agentId}]`;
}

// ─── viem Clients ─────────────────────────────────────────────────────────────

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

// ─── Text Record ABI ──────────────────────────────────────────────────────────

const resolverAbi = parseAbi([
  "function setText(bytes32 node, string calldata key, string calldata value) external",
  "function multicall(bytes[] calldata data) external returns (bytes[] memory)",
]);

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Set the vcr.policy ENS text record pointing to an IPFS CID.
 */
export async function setVCRPolicyRecord(
  ensName: string,
  policyUri: string
): Promise<ENSSetResult> {
  const walletClient = getWalletClient();
  const node = namehash(normalize(ensName));
  const resolver = ENS_ADDRESSES.publicResolverSepolia;

  const txHash = await walletClient.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "setText",
    args: [node, "vcr.policy", policyUri],
  });

  return { txHash, ensName, key: "vcr.policy", value: policyUri };
}

/**
 * Set the ENSIP-25 agent-registration text record.
 * Value "1" means the link is active.
 */
export async function setAgentRegistrationRecord(
  ensName: string,
  agentId: number,
  registryAddress = ERC8004_REGISTRY_SEPOLIA,
  chainId = 11155111
): Promise<ENSSetResult> {
  const walletClient = getWalletClient();
  const node = namehash(normalize(ensName));
  const resolver = ENS_ADDRESSES.publicResolverSepolia;
  const key = buildAgentRegistrationKey(registryAddress, chainId, agentId);

  const txHash = await walletClient.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "setText",
    args: [node, key, "1"],
  });

  return { txHash, ensName, key, value: "1" };
}

/**
 * Set both agent-registration and vcr.policy records in a single multicall tx.
 */
export async function setAllENSRecords(
  ensName: string,
  agentId: number,
  policyUri: string,
  registryAddress = ERC8004_REGISTRY_SEPOLIA,
  chainId = 11155111
): Promise<{ txHash: string }> {
  const walletClient = getWalletClient();
  const node = namehash(normalize(ensName));
  const resolver = ENS_ADDRESSES.publicResolverSepolia;
  const agentKey = buildAgentRegistrationKey(registryAddress, chainId, agentId);

  const encoded1 = encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [node, agentKey, "1"],
  });
  const encoded2 = encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [node, "vcr.policy", policyUri],
  });

  const txHash = await walletClient.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "multicall",
    args: [[encoded1, encoded2]],
  });

  return { txHash };
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Read the vcr.policy text record from ENS.
 * Returns the ipfs:// URI or null if not set.
 */
export async function getVCRPolicyUri(ensName: string): Promise<string | null> {
  const publicClient = getPublicClient();
  return publicClient.getEnsText({
    name: normalize(ensName),
    key: "vcr.policy",
  });
}

/**
 * Read the ENSIP-25 agent-registration record.
 * Returns "1" if the link is active, null if not set.
 */
export async function getAgentRegistrationRecord(
  ensName: string,
  agentId: number,
  registryAddress = ERC8004_REGISTRY_SEPOLIA,
  chainId = 11155111
): Promise<string | null> {
  const publicClient = getPublicClient();
  const key = buildAgentRegistrationKey(registryAddress, chainId, agentId);
  return publicClient.getEnsText({
    name: normalize(ensName),
    key,
  });
}

/**
 * Verify the bidirectional ENS ↔ ERC-8004 link.
 * Returns true only if the text record value is "1".
 */
export async function verifyAgentENSLink(
  ensName: string,
  agentId: number,
  registryAddress = ERC8004_REGISTRY_SEPOLIA,
  chainId = 11155111
): Promise<boolean> {
  const record = await getAgentRegistrationRecord(ensName, agentId, registryAddress, chainId);
  return record === "1";
}
