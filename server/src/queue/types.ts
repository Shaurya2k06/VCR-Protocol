import type { CreateAgentConfig } from "@vcr-protocol/sdk";

export interface StorePolicyJobData {
  agentId: string;
  policy: unknown;
}

export type RegistrationDomainMode = "managed" | "self-owned";

export interface RegisterAgentConfig extends CreateAgentConfig {
  creatorAddress: `0x${string}`;
  domainMode: RegistrationDomainMode;
}

export interface RegisterAgentRulesDocumentOverrides {
  rulesDocumentUrl?: string;
  rulesDocumentRaw?: string;
}

export interface RegisterAgentJobData {
  config: RegisterAgentConfig;
  rulesDocumentOverrides?: RegisterAgentRulesDocumentOverrides;
}

export type RegisterAgentStage =
  | "QUEUED"
  | "RUNNING"
  | "ENS_REGISTERED"
  | "ENS_DEFERRED_SELF_OWNED"
  | "COMPLETED"
  | "FAILED";

export interface RegisterAgentJobProgress {
  stage: RegisterAgentStage;
  ensName?: string;
  agentId?: number;
  registrationTxHash?: string;
  ensTxHash?: string;
  lastLog?: string;
  logs?: string[];
  updatedAt: string;
}

export interface RegisterAgentJobResult {
  stage: "COMPLETED";
  ensName: string;
  agentId: number;
  registrationTxHash: string;
  ensTxHash?: string;
}
