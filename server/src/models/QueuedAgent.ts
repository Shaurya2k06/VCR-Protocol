import mongoose, { type Document, Schema } from "mongoose";

export type AgentQueueStatus = "PENDING" | "PROCESSING" | "ACTIVE" | "FAILED";
export type AgentStorageSource = "fileverse" | "pinata" | null;

export interface IQueuedAgent extends Document {
  agentId: string;
  status: AgentQueueStatus;
  policyCid?: string;
  storageSource: AgentStorageSource;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QueuedAgentSchema = new Schema<IQueuedAgent>(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "ACTIVE", "FAILED"],
      required: true,
      index: true,
    },
    policyCid: { type: String },
    storageSource: {
      type: String,
      enum: ["fileverse", "pinata"],
      default: null,
    },
    failureReason: { type: String },
  },
  { timestamps: true },
);

export const QueuedAgent =
  (mongoose.models.QueuedAgent as mongoose.Model<IQueuedAgent> | undefined) ??
  mongoose.model<IQueuedAgent>("QueuedAgent", QueuedAgentSchema);

export async function createPendingAgent(agentId: string): Promise<IQueuedAgent> {
  return QueuedAgent.create({
    agentId,
    status: "PENDING",
    policyCid: undefined,
    storageSource: null,
  });
}

export async function markAgentProcessing(agentId: string): Promise<IQueuedAgent | null> {
  return QueuedAgent.findOneAndUpdate(
    { agentId },
    {
      $set: {
        status: "PROCESSING",
        failureReason: undefined,
      },
    },
    { new: true },
  );
}

export async function markAgentActive(
  agentId: string,
  policyCid: string,
  storageSource: "fileverse" | "pinata",
): Promise<IQueuedAgent | null> {
  return QueuedAgent.findOneAndUpdate(
    { agentId },
    {
      $set: {
        status: "ACTIVE",
        policyCid,
        storageSource,
        failureReason: undefined,
      },
    },
    { new: true },
  );
}

export async function markAgentFailed(
  agentId: string,
  failureReason: string,
): Promise<IQueuedAgent | null> {
  return QueuedAgent.findOneAndUpdate(
    { agentId },
    {
      $set: {
        status: "FAILED",
        failureReason,
      },
    },
    { new: true },
  );
}
