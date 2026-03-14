import { Agent } from "@fileverse/agents";
import { PinataStorageProvider } from "@fileverse/agents/storage/index.js";
import fs from "fs/promises";
import stringify from "json-stringify-deterministic";
import path from "path";
import { privateKeyToAccount } from "viem/accounts";
import type { FileversePolicyResult, VCRPolicy } from "./types.js";

export const FILEVERSE_ACTIVITY_URL = "https://agents.fileverse.io/";
function getFileverseAgent(): Agent {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  const pinataJwt = process.env.PINATA_JWT;
  const pinataGateway = process.env.PINATA_GATEWAY;

  if (!privateKey) throw new Error("PRIVATE_KEY must be set");
  if (!pimlicoApiKey) throw new Error("PIMLICO_API_KEY must be set");
  if (!pinataJwt || !pinataGateway) {
    throw new Error("PINATA_JWT and PINATA_GATEWAY must be set");
  }

  const storageProvider = new PinataStorageProvider({
    pinataJWT: pinataJwt,
    pinataGateway,
  });

  return new Agent({
    chain: "sepolia",
    viemAccount: privateKeyToAccount(privateKey),
    pimlicoAPIKey: pimlicoApiKey,
    storageProvider,
  });
}

export function buildPolicyNamespace(agentName: string): string {
  const sanitized = agentName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `vcr-policy-${sanitized}`;
}

export function normalizePolicyNamespace(namespace: string): string {
  return namespace.replace(/(?:-(?:sepolia|gnosis))+$/i, "");
}

export function getFileverseActivityUrl(): string {
  return FILEVERSE_ACTIVITY_URL;
}

function buildFileversePolicyMetadata(policy: VCRPolicy): Record<string, unknown> {
  return {
    kind: "vcr-policy",
    title: policy.ensName ? `${policy.ensName} Policy` : `Agent Policy ${policy.agentId}`,
    agentId: policy.agentId,
    ensName: policy.ensName,
    createdAt: policy.metadata.createdAt,
    createdBy: policy.metadata.createdBy,
  };
}

function toUrlSafeBase64(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createPolicyMarkdownDocument(policy: VCRPolicy): string {
  const canonicalJson = stringify(policy, { space: "  " });
  const timeRestriction = policy.constraints.timeRestrictions
    ? `${policy.constraints.timeRestrictions.allowedHours[0]}:00–${policy.constraints.timeRestrictions.allowedHours[1]}:00 ${policy.constraints.timeRestrictions.timezone}`
    : "None";

  const recipients = policy.constraints.allowedRecipients
    .map((recipient) => `- ${recipient}`)
    .join("\n");

  const tokens = policy.constraints.allowedTokens
    .map((token) => `- ${token}`)
    .join("\n");

  const chains = policy.constraints.allowedChains
    .map((chain) => `- ${chain}`)
    .join("\n");

  const expiresAtLine = policy.metadata.expiresAt
    ? `- Expires At: ${policy.metadata.expiresAt}`
    : null;

  return [
    "# VCR Rules and Regulations",
    "",
    "## Agent",
    `- ENS Name: ${policy.ensName ?? "N/A"}`,
    `- Agent ID: ${policy.agentId}`,
    `- Wallet Address: ${policy.walletAddress ?? "N/A"}`,
    `- Custodian: ${policy.custodian ?? "N/A"}`,
    `- Network: ${policy.network ?? "N/A"}`,
    "",
    "## Constraints",
    `- Max Transaction: ${policy.constraints.maxTransaction.amount} ${policy.constraints.maxTransaction.token} on ${policy.constraints.maxTransaction.chain} (base units)`,
    `- Daily Limit: ${policy.constraints.dailyLimit.amount} ${policy.constraints.dailyLimit.token} on ${policy.constraints.dailyLimit.chain} (base units)`,
    `- Allowed Hours: ${timeRestriction}`,
    "",
    "## Allowed Recipients",
    recipients,
    "",
    "## Allowed Tokens",
    tokens,
    "",
    "## Allowed Chains",
    chains,
    "",
    "## Metadata",
    `- Created At: ${policy.metadata.createdAt}`,
    `- Created By: ${policy.metadata.createdBy}`,
    `- Description: ${policy.metadata.description ?? "N/A"}`,
    ...(expiresAtLine ? [expiresAtLine] : []),
    "",
    "## Canonical Policy JSON",
    "```json",
    canonicalJson,
    "```",
    "",
  ].join("\n");
}

function createPolicyDocument(policy: VCRPolicy): string {
  return createPolicyMarkdownDocument(policy);
}

function getViewerCredNamespaceCandidates(namespace: string): string[] {
  const normalized = normalizePolicyNamespace(namespace);
  return Array.from(new Set([
    namespace,
    normalized,
    `${namespace}-sepolia`,
    `${normalized}-sepolia`,
    `${namespace}-gnosis`,
    `${normalized}-gnosis`,
  ]));
}

async function buildFileverseViewerUrl(
  namespace: string,
  portalAddress: string,
  fileId: string,
): Promise<string | undefined> {
  for (const candidateNamespace of getViewerCredNamespaceCandidates(namespace)) {
    const credsPath = path.resolve("creds", `${candidateNamespace}.json`);
    try {
      const raw = await fs.readFile(credsPath, "utf8");
      const creds = JSON.parse(raw) as {
        portalKeys?: { viewSecret?: string };
      };
      const viewSecret = creds.portalKeys?.viewSecret;
      if (!viewSecret) continue;

      return `https://docs.fileverse.io/${portalAddress}/${fileId}#key=${toUrlSafeBase64(viewSecret)}`;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function storePolicyDocument(
  policy: VCRPolicy,
  namespace: string,
): Promise<FileversePolicyResult> {
  const agent = getFileverseAgent();
  const baseNamespace = normalizePolicyNamespace(namespace);
  await agent.setupStorage(baseNamespace);

  const result = await agent.create(
    createPolicyDocument(policy),
    buildFileversePolicyMetadata(policy),
  );
  const file = await agent.getFile(result.fileId);
  const fileId = String(result.fileId);
  const viewerUrl = await buildFileverseViewerUrl(
    file.namespace,
    file.portal,
    fileId,
  );

  return {
    fileId,
    portalAddress: file.portal,
    namespace: baseNamespace,
    contentUri: file.contentIpfsHash,
    metadataUri: file.metadataIpfsHash,
    txHash: result.hash,
    activityUrl: getFileverseActivityUrl(),
    viewerUrl,
  };
}

export async function appendPolicyVersion(
  policy: VCRPolicy,
  namespace: string,
): Promise<FileversePolicyResult> {
  return storePolicyDocument(policy, namespace);
}
