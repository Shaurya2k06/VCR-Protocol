// ─── Transaction Log Model — Record of All Payments ───────────────────────────
import mongoose, { type Document, Schema } from "mongoose";

export interface ITransaction extends Document {
    /** Agent's ENS name */
    ensName: string;
    /** ERC-8004 agentId */
    agentId?: number;
    /** Transaction type */
    type: "x402_payment" | "bitgo_send" | "bitgo_receive" | "policy_violation";
    /** Amount in base units */
    amount: string;
    /** Token symbol */
    token: string;
    /** Recipient address */
    recipient: string;
    /** Chain identifier */
    chain: string;
    /** Whether VCR policy allowed it */
    vcrAllowed: boolean;
    /** VCR denial reason (if blocked) */
    vcrReason?: string;
    /** On-chain transaction hash (if settled) */
    txHash?: string;
    /** BitGo pending approval ID (if policy-blocked) */
    pendingApprovalId?: string;
    /** Status of the transaction */
    status: "completed" | "pending" | "rejected" | "failed";
    /** Policy CID at time of transaction */
    policyCid?: string;
    createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
    {
        ensName: { type: String, required: true, lowercase: true, index: true },
        agentId: { type: Number, index: true },
        type: {
            type: String,
            required: true,
            enum: ["x402_payment", "bitgo_send", "bitgo_receive", "policy_violation"],
        },
        amount: { type: String, required: true },
        token: { type: String, required: true, uppercase: true },
        recipient: { type: String, required: true, lowercase: true },
        chain: { type: String, required: true },
        vcrAllowed: { type: Boolean, required: true },
        vcrReason: { type: String },
        txHash: { type: String, sparse: true },
        pendingApprovalId: { type: String },
        status: {
            type: String,
            required: true,
            enum: ["completed", "pending", "rejected", "failed"],
        },
        policyCid: { type: String },
    },
    { timestamps: true }
);

TransactionSchema.index({ ensName: 1, createdAt: -1 });
TransactionSchema.index({ agentId: 1, createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);

// ─── Helper Functions ─────────────────────────────────────────────────────────

export async function logTransaction(
    data: Omit<ITransaction, keyof Document | "createdAt">
): Promise<ITransaction> {
    return Transaction.create(data);
}

export async function getTransactionsByAgent(
    ensName: string,
    limit = 50
): Promise<ITransaction[]> {
    return Transaction.find({ ensName: ensName.toLowerCase() })
        .sort({ createdAt: -1 })
        .limit(limit);
}

export async function getTransactionsByStatus(
    status: ITransaction["status"],
    limit = 50
): Promise<ITransaction[]> {
    return Transaction.find({ status })
        .sort({ createdAt: -1 })
        .limit(limit);
}
