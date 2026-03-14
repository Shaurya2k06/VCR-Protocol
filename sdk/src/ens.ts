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
import type { ENSSetResult, LinkVerificationResult } from "./types.js";

// ─── Contract Addresses ───────────────────────────────────────────────────────

export const ENS_ADDRESSES = {
  registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const,
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as const,
  publicResolverMainnet: "0xF29100983E058B709F3D539b0c765937B804AC15" as const,
  publicResolverSepolia: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const,
} as const;

// ERC-8004 IdentityRegistry — Sepolia testnet
export const ERC8004_REGISTRY_SEPOLIA =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

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
  const chainRefHex = chainRefBytes
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const version = "0001"; // Version 1 (2 bytes)
  const chainType = "0000"; // EVM chain type (2 bytes)
  const chainRefLenHex = chainRefLen.toString(16).padStart(2, "0");
  const addrLen = "14"; // 20 bytes

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
  agentId: number,
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
  if (!rpcUrl || !privateKey)
    throw new Error("SEPOLIA_RPC_URL and PRIVATE_KEY must be set");
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
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
  policyUri: string,
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
  chainId = 11155111,
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
  chainId = 11155111,
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

  let txHash: `0x${string}` | undefined;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      txHash = await walletClient.writeContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "multicall",
        args: [[encoded1, encoded2]],
      });
      break;
    } catch (err: any) {
      if (attempt < 5 && err.message?.includes("reverted")) {
        console.log(`\n      ⚠️  Resolver not ready yet (Tx reverted). Retrying in 15s (Attempt ${attempt}/5)…`);
        await new Promise(r => setTimeout(r, 15000));
      } else {
        throw err;
      }
    }
  }

  return { txHash: txHash! };
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
  chainId = 11155111,
): Promise<string | null> {
  const publicClient = getPublicClient();
  const key = buildAgentRegistrationKey(registryAddress, chainId, agentId);
  return publicClient.getEnsText({
    name: normalize(ensName),
    key,
  });
}

// ABI fragment used for ownership cross-check in verifyAgentENSLink
const identityRegistryReadAbi = parseAbi([
  "function getOwner(uint256 agentId) external view returns (address)",
]);

/**
 * Verify the bidirectional ENS ↔ ERC-8004 link per ENSIP-25.
 *
 * Performs three checks:
 *   1. The ENSIP-25 agent-registration text record exists and is non-empty
 *      (ENSIP-25 only requires non-empty; VCR convention is "1")
 *   2. The ERC-8004 registry confirms ownership of the agentId
 *   3. The ENS name's resolved address matches the registry agent owner
 *      (proves the ENS name is controlled by the same party as the ERC-8004 entry)
 *
 * Returns a full {@link LinkVerificationResult} describing the outcome.
 *
 * @param ensName         - e.g. "researcher-001.acmecorp.eth"
 * @param agentId         - ERC-8004 agentId (starts from 0)
 * @param registryAddress - Defaults to ERC-8004 Sepolia IdentityRegistry
 * @param chainId         - Defaults to 11155111 (Sepolia)
 */
export async function verifyAgentENSLink(
  ensName: string,
  agentId: number,
  registryAddress = ERC8004_REGISTRY_SEPOLIA,
  chainId = 11155111,
): Promise<LinkVerificationResult> {
  const publicClient = getPublicClient();

  // ── Check 1: ENSIP-25 agent-registration text record ──────────────────────
  const key = buildAgentRegistrationKey(registryAddress, chainId, agentId);
  const ensRecord = await publicClient.getEnsText({
    name: normalize(ensName),
    key,
  });

  if (!ensRecord) {
    return {
      valid: false,
      reason: `ENSIP-25 record not set. Key: ${key}`,
      ensRecord: ensRecord ?? undefined,
    };
  }

  // ── Check 2: ERC-8004 registry ownership ─────────────────────────────────
  let registryOwner: string;
  try {
    registryOwner = (await publicClient.readContract({
      address: registryAddress as `0x${string}`,
      abi: identityRegistryReadAbi,
      functionName: "getOwner",
      args: [BigInt(agentId)],
    })) as string;
  } catch (err) {
    return {
      valid: false,
      reason: `ERC-8004 registry lookup failed: ${(err as Error).message}`,
      ensRecord,
    };
  }

  // ── Check 3: ENS addr record matches ERC-8004 agent owner ─────────────────
  // The ENS name's addr record should resolve to the same address that
  // owns the agentId in the ERC-8004 registry, proving the link is bidirectional.
  let ensOwner: string | null;
  try {
    ensOwner = await publicClient.getEnsAddress({
      name: normalize(ensName),
    });
  } catch (err) {
    return {
      valid: false,
      reason: `ENS address resolution failed: ${(err as Error).message}`,
      ensRecord,
      registryOwner,
    };
  }

  if (!ensOwner) {
    return {
      valid: false,
      reason: `ENS name "${ensName}" does not resolve to an address`,
      ensRecord,
      registryOwner,
    };
  }

  if (registryOwner.toLowerCase() !== ensOwner.toLowerCase()) {
    return {
      valid: false,
      reason:
        `Owner mismatch — ERC-8004 registry owner (${registryOwner}) ` +
        `does not match ENS addr record (${ensOwner})`,
      ensRecord,
      registryOwner,
      ensOwner,
    };
  }

  return {
    valid: true,
    ensRecord,
    registryOwner,
    ensOwner,
  };
}
