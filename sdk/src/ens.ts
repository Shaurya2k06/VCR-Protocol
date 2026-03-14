import { getWalletClient } from "./client.js";

// ─── ENS Integration — ENSIP-25 + VCR Policy Text Records ────────────────────
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  labelhash,
  keccak256,
  concat,
  toBytes,
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

// Sepolia NameWrapper — used when the parent domain is wrapped
const NAME_WRAPPER_SEPOLIA = "0x0635513f179D50A207757E05759CbD106d7dFcE8" as const;

// ─── ENS Registry ABI (subset) ──────────────────────────────────────────────
const ensRegistryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external",
]);

// ─── NameWrapper ABI (subset) ────────────────────────────────────────────────
const nameWrapperAbi = parseAbi([
  "function setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) external returns (bytes32 node)",
  "function owner(bytes32 id) view returns (address)",
  "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
]);

// ERC-8004 IdentityRegistry — Sepolia testnet
export const ERC8004_REGISTRY_SEPOLIA =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

/**
 * Encode an EVM address + chainId into ERC-7930 binary format.
 * Used to build the ENSIP-25 agent-registration text record key.
 *
 * Official binary format (from ERC-7930 / ENSIP-25):
 *   Version          (2 bytes, big-endian) = 0x0001
 *   ChainType        (2 bytes, big-endian) = 0x0000 for EVM
 *   ChainRefLength   (1 byte)              = minimal bytes for chainId
 *   ChainReference   (variable)            = chainId as big-endian bytes
 *   AddressLength    (1 byte)              = 0x14 (20 bytes)
 *   Address          (20 bytes)
 *
 * Examples:
 *   encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")
 *   → "0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432"
 *
 *   encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e")
 *   → "0x0001000003aa36a7148004a818bfb912233c491871b3d84c89a494bd9e"
 */
export function encodeERC7930(chainId: number, address: string): string {
  const addrHex = address.replace(/^0x/i, "").toLowerCase().padStart(40, "0");

  const chainRefBytes = chainIdToMinimalBytes(chainId);
  const chainRefLen = chainRefBytes.length;
  const chainRefHex = chainRefBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const version = "0001";
  const chainType = "0000";
  const chainRefLenHex = chainRefLen.toString(16).padStart(2, "0");
  const addrLen = "14";

  return `0x${version}${chainType}${chainRefLenHex}${chainRefHex}${addrLen}${addrHex}`;
}

/**
 * Convert a chain ID to its minimal big-endian byte representation.
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
  const walletClient = await getWalletClient();
  await ensureSubdomainExists(ensName);
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
  const walletClient = await getWalletClient();
  await ensureSubdomainExists(ensName);
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
  const walletClient = await getWalletClient();
  await ensureSubdomainExists(ensName);
  const node = namehash(normalize(ensName));
  const resolver = ENS_ADDRESSES.publicResolverSepolia;
  const agentKey = buildAgentRegistrationKey(registryAddress, chainId, agentId);

  const encodedAgentRegistration = encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [node, agentKey, "1"],
  });

  const encodedPolicyPointer = encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [node, "vcr.policy", policyUri],
  });

  console.log(`\n      [ENS] Setting agent-registration + vcr.policy via multicall...`);
  const txHash = await walletClient.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "multicall",
    args: [[encodedAgentRegistration, encodedPolicyPointer]],
  });

  return { txHash };
}


// ─── Subdomain helpers ────────────────────────────────────────────────────────

/**
 * Compute the ENS node hash for a subdomain.
 * node(sub.parent) = keccak256(node(parent) ++ labelhash(sub))
 */
function computeSubnodeHash(parentNode: `0x${string}`, sublabel: string): `0x${string}` {
  return keccak256(concat([toBytes(parentNode), toBytes(labelhash(sublabel))])) as `0x${string}`;
}

/**
 * Ensure the immediate subdomain of ensName exists in the ENS registry with
 * the correct resolver and owner set to the signer's account.
 *
 * Handles both wrapped (NameWrapper) and unwrapped parent domains.
 * Creates the subdomain if it doesn't exist; skips if it already does.
 */
async function ensureSubdomainExists(ensName: string): Promise<void> {
  const walletClient = await getWalletClient();
  const publicClient = getPublicClient();
  const signerAddress = walletClient.account!.address as `0x${string}`;
  const resolver = ENS_ADDRESSES.publicResolverSepolia;
  const registry = ENS_ADDRESSES.registry;

  // Split "sub.parent.eth" → sublabel="sub", parentDomain="parent.eth"
  const labels = ensName.split(".");
  if (labels.length < 3) {
    throw new Error(`ENS name "${ensName}" must have at least 3 labels (e.g. agent.acmecorp.eth)`);
  }
  const sublabel = labels[0]!;
  const parentDomain = labels.slice(1).join(".");

  const parentNode = namehash(normalize(parentDomain)) as `0x${string}`;
  const subnodeHash = computeSubnodeHash(parentNode, sublabel);

  // Check if subdomain already exists
  const subnodeOwner = await publicClient.readContract({
    address: registry,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [subnodeHash],
  }) as `0x${string}`;

  if (subnodeOwner !== "0x0000000000000000000000000000000000000000") {
    console.log(`      [ENS] Subdomain "${ensName}" already exists (owner: ${subnodeOwner})`);
    return;
  }

  // Subdomain doesn't exist — need to create it.
  // Detect whether the parent domain is wrapped in the NameWrapper.
  const parentRegistryOwner = await publicClient.readContract({
    address: registry,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [parentNode],
  }) as `0x${string}`;

  if (parentRegistryOwner === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `Parent domain "${parentDomain}" is not registered in ENS on Sepolia.\n` +
      `Run 'npm run register-ens' to register a domain you own first.\n` +
      `Or pass --domain <your-ens-name> to use a domain you already own.`,
    );
  }

  const parentIsWrapped = parentRegistryOwner.toLowerCase() === NAME_WRAPPER_SEPOLIA.toLowerCase();

  if (!parentIsWrapped && parentRegistryOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `Your wallet (${signerAddress}) does not own the parent domain "${parentDomain}".\n` +
      `Current owner: ${parentRegistryOwner}\n` +
      `You can only create subdomains under a domain you own.\n` +
      `Run 'npm run register-ens' to register a new domain, or use --domain <your-ens>.`,
    );
  }

  if (parentIsWrapped) {
    let wrappedOwner: `0x${string}`;

    try {
      [wrappedOwner] = await publicClient.readContract({
        address: NAME_WRAPPER_SEPOLIA,
        abi: nameWrapperAbi,
        functionName: "getData",
        args: [BigInt(parentNode)],
      }) as [`0x${string}`, number, bigint];
    } catch (error) {
      throw new Error(
        `Unable to read wrapped owner for parent domain "${parentDomain}": ${(error as Error).message}`,
      );
    }

    if (wrappedOwner.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(
        `Your wallet (${signerAddress}) does not own the wrapped parent domain "${parentDomain}".\n` +
        `Wrapped owner: ${wrappedOwner}\n` +
        `Use --domain <ens-you-own> or set ENS_BASE_DOMAIN in .env to a domain owned by PRIVATE_KEY.`,
      );
    }
  }

  console.log(`      [ENS] Creating subdomain "${ensName}" (parent is ${parentIsWrapped ? "wrapped" : "unwrapped"})...`);

  let subTxHash: `0x${string}`;

  if (parentIsWrapped) {
    const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
    subTxHash = await walletClient.writeContract({
      address: NAME_WRAPPER_SEPOLIA,
      abi: nameWrapperAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, sublabel, signerAddress, resolver, 0n, 0, expiryTimestamp],
    });
  } else {
    subTxHash = await walletClient.writeContract({
      address: registry,
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, labelhash(sublabel) as `0x${string}`, signerAddress, resolver, 0n],
    });
  }

  console.log(`      [ENS] Subdomain creation tx: ${subTxHash}`);
  await publicClient.waitForTransactionReceipt({ hash: subTxHash });
  console.log(`      [ENS] Subdomain "${ensName}" created ✅`);
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
  "function ownerOf(uint256 agentId) external view returns (address)",
]);

/**
 * Verify the bidirectional ENS ↔ ERC-8004 link per ENSIP-25.
 *
 * Performs three checks:
 *   1. The ENSIP-25 agent-registration text record exists and is non-empty
 *      (ENSIP-25 only requires non-empty; VCR convention is "1")
 *   2. The ERC-8004 registry confirms ownership of the agentId
 *   3. The ENS name owner matches the registry agent owner
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
      functionName: "ownerOf",
      args: [BigInt(agentId)],
    })) as string;
  } catch (err) {
    return {
      valid: false,
      reason: `ERC-8004 registry lookup failed: ${(err as Error).message}`,
      ensRecord,
    };
  }

  // ── Check 3: ENS name owner matches ERC-8004 agent owner ──────────────────
  // Use the ENS Registry owner (or NameWrapper wrapped owner) rather than the
  // addr record. The addr record is optional and is not what proves control.
  let ensOwner: string | null;
  try {
    const node = namehash(normalize(ensName)) as `0x${string}`;
    const registryOwner = (await publicClient.readContract({
      address: ENS_ADDRESSES.registry,
      abi: ensRegistryAbi,
      functionName: "owner",
      args: [node],
    })) as `0x${string}`;

    if (registryOwner === "0x0000000000000000000000000000000000000000") {
      ensOwner = null;
    } else if (registryOwner.toLowerCase() === NAME_WRAPPER_SEPOLIA.toLowerCase()) {
      const [wrappedOwner] = (await publicClient.readContract({
        address: NAME_WRAPPER_SEPOLIA,
        abi: nameWrapperAbi,
        functionName: "getData",
        args: [BigInt(node)],
      })) as [`0x${string}`, number, bigint];
      ensOwner = wrappedOwner;
    } else {
      ensOwner = registryOwner;
    }
  } catch (err) {
    return {
      valid: false,
      reason: `ENS owner lookup failed: ${(err as Error).message}`,
      ensRecord,
      registryOwner,
    };
  }

  if (!ensOwner) {
    return {
      valid: false,
      reason: `ENS name "${ensName}" has no owner in the ENS registry`,
      ensRecord,
      registryOwner,
    };
  }

  if (registryOwner.toLowerCase() !== ensOwner.toLowerCase()) {
    return {
      valid: false,
      reason:
        `Owner mismatch — ERC-8004 registry owner (${registryOwner}) ` +
        `does not match ENS name owner (${ensOwner})`,
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
