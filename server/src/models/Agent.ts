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
    /** ENS profile avatar URI */
    avatarUri?: string;
    /** ENS profile header URI */
    headerUri?: string;
    /** IPFS URI of the Agent Metadata JSON (ERC-8004 agentURI) */
    agentUri: string;
    /** IPFS URI of the VCR Policy JSON */
    policyUri?: string;
    /** Frontend-displayable rules/regulations document link (Fileverse/IPFS/gateway URL) */
    rulesDocumentUrl?: string;
    /** Raw rules/regulations document content snapshot (JSON string) */
    rulesDocumentRaw?: string;
    /** Origin of the stored rules/regulations document */
    rulesDocumentSource?: "fileverse" | "ipfs" | "inline";
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
        avatarUri: { type: String },
        headerUri: { type: String },
        agentUri: { type: String, required: true },
        policyUri: { type: String },
        rulesDocumentUrl: { type: String },
        rulesDocumentRaw: { type: String },
        rulesDocumentSource: {
            type: String,
            enum: ["fileverse", "ipfs", "inline"],
        },
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

export async function getAllAgents(limit = 100): Promise<IAgent[]> {
    return Agent.find({})
        .sort({ createdAt: -1 })
        .limit(limit);
}

export async function updateAgentProfile(
    agentId: number,
    profile: { avatarUri?: string; headerUri?: string }
): Promise<IAgent | null> {
    const updates: Record<string, string> = {};
    if (profile.avatarUri) {
        updates.avatarUri = profile.avatarUri;
    }
    if (profile.headerUri) {
        updates.headerUri = profile.headerUri;
    }

    return Agent.findOneAndUpdate(
        { agentId },
        { $set: updates },
        { new: true }
    );
}

export async function updateAgentPolicy(
    agentId: number,
    policy: {
        policyUri: string;
        policyCid: string;
        supportedTokens?: string[];
        supportedChains?: string[];
    }
): Promise<IAgent | null> {
    const updates: Record<string, unknown> = {
        policyUri: policy.policyUri,
        policyCid: policy.policyCid,
    };

    if (Array.isArray(policy.supportedTokens) && policy.supportedTokens.length > 0) {
        updates.supportedTokens = policy.supportedTokens;
    }

    if (Array.isArray(policy.supportedChains) && policy.supportedChains.length > 0) {
        updates.supportedChains = policy.supportedChains;
    }

    return Agent.findOneAndUpdate(
        { agentId },
        { $set: updates },
        { new: true }
    );
}

export async function updateAgentRulesDocument(
    agentId: number,
    rulesDocument: {
        rulesDocumentUrl?: string;
        rulesDocumentRaw?: string;
        rulesDocumentSource?: "fileverse" | "ipfs" | "inline";
    }
): Promise<IAgent | null> {
    return Agent.findOneAndUpdate(
        { agentId },
        { $set: rulesDocument },
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
