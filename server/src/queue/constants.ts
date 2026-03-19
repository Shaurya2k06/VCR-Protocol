export const AGENT_QUEUE_NAME = "agent-creation";
export const STORE_POLICY_JOB_NAME = "store-policy";
export const REGISTER_AGENT_QUEUE_NAME = "register-agent";
export const REGISTER_AGENT_JOB_NAME = "create-sdk-agent";

export const STORE_POLICY_JOB_ATTEMPTS = 5;
export const STORE_POLICY_JOB_BACKOFF_MS = 5_000;
export const STORE_POLICY_JOB_TIMEOUT_MS = 60_000;
export const FILEVERSE_TIMEOUT_MS = 20_000;

export const REGISTER_AGENT_JOB_ATTEMPTS = 1;
export const REGISTER_AGENT_JOB_BACKOFF_MS = 5_000;
export const REGISTER_AGENT_JOB_TIMEOUT_MS = 45 * 60_000;
