import { randomUUID } from "crypto";

export type AgentCreationJobStatus = "queued" | "running" | "succeeded" | "failed";
export type AgentCreationStepStatus = "pending" | "active" | "completed" | "failed";

export interface AgentCreationStep {
  key: string;
  label: string;
  status: AgentCreationStepStatus;
}

export interface AgentCreationLogEntry {
  id: string;
  message: string;
  timestamp: string;
}

export interface AgentCreationJobResult {
  record: Record<string, unknown>;
  ownership: {
    creatorAddress?: string;
    signingAddress: string;
    domainMode: "managed" | "self-owned";
    feeResponsibility: string;
  };
  links: {
    ensApp: string;
    registrationTx: string;
    ensTx?: string;
    ipfs: string;
    policyUri: string;
  };
  permissions: {
    maxPerTxUsdc: string;
    dailyLimitUsdc: string;
    allowedRecipients: string[];
    allowedTokens: string[];
    allowedChains: string[];
    allowedHours?: [number, number];
  };
}

export interface AgentCreationJob {
  id: string;
  status: AgentCreationJobStatus;
  createdAt: string;
  updatedAt: string;
  steps: AgentCreationStep[];
  logs: AgentCreationLogEntry[];
  error?: string;
  result?: AgentCreationJobResult;
}

const STEP_TEMPLATES: AgentCreationStep[] = [
  { key: "wallet", label: "Create BitGo wallet", status: "pending" },
  { key: "erc8004", label: "Register ERC-8004 identity", status: "pending" },
  { key: "policy", label: "Publish policy and metadata", status: "pending" },
  { key: "ens", label: "Bind ENS records", status: "pending" },
  { key: "finalize", label: "Finalize and persist agent", status: "pending" },
];

const jobs = new Map<string, AgentCreationJob>();

function touch(job: AgentCreationJob): void {
  job.updatedAt = new Date().toISOString();
}

function cloneSteps(): AgentCreationStep[] {
  return STEP_TEMPLATES.map((step) => ({ ...step }));
}

function findStep(job: AgentCreationJob, key: string): AgentCreationStep | undefined {
  return job.steps.find((step) => step.key === key);
}

function setActiveStep(job: AgentCreationJob, key: string): void {
  for (const step of job.steps) {
    if (step.key === key) {
      if (step.status === "pending") {
        step.status = "active";
      }
      continue;
    }

    if (step.status === "active") {
      step.status = "completed";
    }
  }
}

function completeStep(job: AgentCreationJob, key: string): void {
  const step = findStep(job, key);
  if (step) {
    step.status = "completed";
  }
}

function failActiveStep(job: AgentCreationJob): void {
  const activeStep =
    job.steps.find((step) => step.status === "active") ??
    job.steps.find((step) => step.status === "pending");

  if (activeStep) {
    activeStep.status = "failed";
  }
}

function updateStepsFromMessage(job: AgentCreationJob, message: string): void {
  if (message.includes("[1/5]")) {
    setActiveStep(job, "wallet");
  } else if (message.includes("[2/5]")) {
    completeStep(job, "wallet");
    setActiveStep(job, "erc8004");
  } else if (message.includes("[3/5]")) {
    completeStep(job, "erc8004");
    setActiveStep(job, "policy");
  } else if (message.includes("[4/5]")) {
    setActiveStep(job, "policy");
  } else if (message.includes("[5/5]")) {
    completeStep(job, "policy");
    setActiveStep(job, "ens");
  } else if (message.includes("ENS records set tx:")) {
    completeStep(job, "ens");
    setActiveStep(job, "finalize");
  } else if (message.includes("Persisting agent record")) {
    setActiveStep(job, "finalize");
  } else if (message.includes('created successfully')) {
    for (const step of job.steps) {
      if (step.status !== "completed") {
        step.status = "completed";
      }
    }
  }
}

export function createAgentCreationJob(): AgentCreationJob {
  const now = new Date().toISOString();
  const job: AgentCreationJob = {
    id: randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    steps: cloneSteps(),
    logs: [],
  };

  jobs.set(job.id, job);
  return job;
}

export function getAgentCreationJob(jobId: string): AgentCreationJob | undefined {
  return jobs.get(jobId);
}

export function startAgentCreationJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = "running";
  touch(job);
}

export function appendAgentCreationJobLog(jobId: string, message: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.logs.push({
    id: randomUUID(),
    message,
    timestamp: new Date().toISOString(),
  });

  updateStepsFromMessage(job, message);
  touch(job);
}

export function completeAgentCreationJob(
  jobId: string,
  result: AgentCreationJobResult,
): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = "succeeded";
  job.result = result;
  for (const step of job.steps) {
    step.status = "completed";
  }
  touch(job);
}

export function failAgentCreationJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = "failed";
  job.error = error;
  failActiveStep(job);
  touch(job);
}
