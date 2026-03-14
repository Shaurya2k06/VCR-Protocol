import { getWalletClient } from "./client.js";

// ─── VCRPolicyRegistry — On-Chain Contract SDK ───────────────────────────────
import {
    createPublicClient,
    createWalletClient,
    http,
    parseAbi,
    type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { namehash, normalize } from "viem/ens";

// ─── ABI ──────────────────────────────────────────────────────────────────────

const vcrRegistryAbi = parseAbi([
    "function setPolicy(bytes32 ensNode, string calldata policyUri, uint256 agentId) external",
    "function revokePolicy(bytes32 ensNode) external",
    "function getPolicy(bytes32 ensNode) external view returns (string policyUri, uint256 agentId, bool active, address setter, uint256 timestamp)",
    "function verifyPolicy(bytes32 ensNode, string calldata policyUri) external view returns (bool valid)",
    "function getPolicyHistoryCount(bytes32 ensNode) external view returns (uint256)",
    "function getPolicyHistoryEntry(bytes32 ensNode, uint256 index) external view returns (string policyUri, uint256 agentId, address setter, uint256 timestamp, bool active)",
    "function totalPolicies() external view returns (uint256)",
]);

// ─── Clients ──────────────────────────────────────────────────────────────────

function getPublicClient() {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set");
    return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}


function getRegistryAddress(): Address {
    const addr = process.env.VCR_REGISTRY_ADDRESS;
    if (!addr) throw new Error("VCR_REGISTRY_ADDRESS not set in environment");
    return addr as Address;
}

// ─── Write Operations ─────────────────────────────────────────────────────────

export interface SetPolicyOnChainResult {
    txHash: string;
    ensNode: string;
    policyUri: string;
    agentId: number;
}

/**
 * Set a VCR policy on the on-chain VCRPolicyRegistry contract.
 * This supplements the ENS text record — provides an alternative lookup path.
 */
export async function setPolicyOnChain(
    ensName: string,
    policyUri: string,
    agentId: number
): Promise<SetPolicyOnChainResult> {
    const walletClient = await getWalletClient();
    const registryAddress = getRegistryAddress();
    const node = namehash(normalize(ensName));

    const txHash = await walletClient.writeContract({
        address: registryAddress,
        abi: vcrRegistryAbi,
        functionName: "setPolicy",
        args: [node, policyUri, BigInt(agentId)],
    });

    return { txHash, ensNode: node, policyUri, agentId };
}

/**
 * Revoke a policy on-chain. Only the original setter can revoke.
 */
export async function revokePolicyOnChain(
    ensName: string
): Promise<{ txHash: string }> {
    const walletClient = await getWalletClient();
    const registryAddress = getRegistryAddress();
    const node = namehash(normalize(ensName));

    const txHash = await walletClient.writeContract({
        address: registryAddress,
        abi: vcrRegistryAbi,
        functionName: "revokePolicy",
        args: [node],
    });

    return { txHash };
}

// ─── Read Operations ──────────────────────────────────────────────────────────

export interface OnChainPolicyRecord {
    policyUri: string;
    agentId: number;
    active: boolean;
    setter: string;
    timestamp: number;
}

/**
 * Get the current policy from the on-chain VCRPolicyRegistry.
 */
export async function getPolicyOnChain(
    ensName: string
): Promise<OnChainPolicyRecord> {
    const publicClient = getPublicClient();
    const registryAddress = getRegistryAddress();
    const node = namehash(normalize(ensName));

    const [policyUri, agentId, active, setter, timestamp] =
        (await publicClient.readContract({
            address: registryAddress,
            abi: vcrRegistryAbi,
            functionName: "getPolicy",
            args: [node],
        })) as [string, bigint, boolean, string, bigint];

    return {
        policyUri,
        agentId: Number(agentId),
        active,
        setter,
        timestamp: Number(timestamp),
    };
}

/**
 * Verify a policy URI on-chain (checks if it matches the current active policy).
 */
export async function verifyPolicyOnChain(
    ensName: string,
    policyUri: string
): Promise<boolean> {
    const publicClient = getPublicClient();
    const registryAddress = getRegistryAddress();
    const node = namehash(normalize(ensName));

    return publicClient.readContract({
        address: registryAddress,
        abi: vcrRegistryAbi,
        functionName: "verifyPolicy",
        args: [node, policyUri],
    }) as Promise<boolean>;
}

/**
 * Get the total number of policies ever registered on-chain.
 */
export async function getTotalPoliciesOnChain(): Promise<number> {
    const publicClient = getPublicClient();
    const registryAddress = getRegistryAddress();

    const total = (await publicClient.readContract({
        address: registryAddress,
        abi: vcrRegistryAbi,
        functionName: "totalPolicies",
        args: [],
    })) as bigint;

    return Number(total);
}

/**
 * Get the policy history count for an ENS name.
 */
export async function getPolicyHistoryCount(ensName: string): Promise<number> {
    const publicClient = getPublicClient();
    const registryAddress = getRegistryAddress();
    const node = namehash(normalize(ensName));

    const count = (await publicClient.readContract({
        address: registryAddress,
        abi: vcrRegistryAbi,
        functionName: "getPolicyHistoryCount",
        args: [node],
    })) as bigint;

    return Number(count);
}
