// ─── Agent Model — Persistent Agent Registry ──────────────────────────────────
import mongoose, { type Document, Schema } from "mongoose";

export interface IAgent extends Document {
    /** ERC-8004 agentId (on-chain, starts from 0) */
    agentId: number;
    /** Agent name */
    name: string;
    /** Agent description */
    description?: string;
    /** Owner wallet address (checksummed) */
    ownerAddress: string;
    /** Frontend wallet that initiated agent creation */
    creatorAddress?: string;
    /** Registration mode used in the frontend */
    registrationMode?: "managed" | "self-owned";
    /** Agent wallet address (if different from owner) */
    agentWalletAddress?: string;
    /** ENS name linked to this agent */
    ensName?: string;
    /** IPFS URI of the Agent Metadata JSON (ERC-8004 agentURI) */
    agentUri: string;
    /** IPFS URI of the VCR Policy JSON */
    policyUri?: string;
    /** Policy CID (without ipfs:// prefix) */
    policyCid?: string;
    /** BitGo wallet ID */
    bitgoWalletId?: string;
    /** VCRPolicyRegistry on-chain address (if registered there too) */
    contractRegistryAddress?: string;
    /** Registration transaction hash */
    registrationTxHash: string;
    /** Whether the agent is currently active */
    active: boolean;
    /** Supported chains for x402 payment */
    supportedChains: string[];
    /** Supported tokens for x402 payment */
    supportedTokens: string[];
    createdAt: Date;
    updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
    {
        agentId: { type: Number, required: true, unique: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        ownerAddress: { type: String, required: true, lowercase: true },
        creatorAddress: { type: String, lowercase: true },
        registrationMode: { type: String, enum: ["managed", "self-owned"] },
        agentWalletAddress: { type: String, lowercase: true },
        ensName: { type: String, lowercase: true, sparse: true },
        agentUri: { type: String, required: true },
        policyUri: { type: String },
        policyCid: { type: String },
        bitgoWalletId: { type: String },
        contractRegistryAddress: { type: String },
        registrationTxHash: { type: String, required: true },
        active: { type: Boolean, default: true },
        supportedChains: { type: [String], default: ["base-sepolia"] },
        supportedTokens: { type: [String], default: ["USDC"] },
    },
    { timestamps: true }
);

// Index for common lookups
AgentSchema.index({ ownerAddress: 1 });
AgentSchema.index({ creatorAddress: 1 });

export const Agent = mongoose.model<IAgent>("Agent", AgentSchema);

// ─── Helper Functions ─────────────────────────────────────────────────────────

export async function saveAgent(data: Omit<IAgent, keyof Document>): Promise<IAgent> {
    return Agent.create(data);
}

export async function getAgentByChainId(agentId: number): Promise<IAgent | null> {
    return Agent.findOne({ agentId });
}

export async function getAgentByEnsName(ensName: string): Promise<IAgent | null> {
    return Agent.findOne({ ensName: ensName.toLowerCase() });
}

export async function getAgentsByOwner(ownerAddress: string): Promise<IAgent[]> {
    const normalized = ownerAddress.toLowerCase();
    return Agent.find({
        $or: [{ ownerAddress: normalized }, { creatorAddress: normalized }],
    });
}

export async function updateAgentPolicy(
    agentId: number,
    policyUri: string,
    policyCid: string
): Promise<IAgent | null> {
    return Agent.findOneAndUpdate(
        { agentId },
        { $set: { policyUri, policyCid } },
        { new: true }
    );
}

export async function updateAgentWallet(
    agentId: number,
    bitgoWalletId: string
): Promise<IAgent | null> {
    return Agent.findOneAndUpdate(
        { agentId },
        { $set: { bitgoWalletId } },
        { new: true }
    );
}
