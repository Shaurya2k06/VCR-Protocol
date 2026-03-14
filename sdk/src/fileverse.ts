import { Agent } from "@fileverse/agents";
import { PinataStorageProvider } from "@fileverse/agents/storage/index.js";
import stringify from "json-stringify-deterministic";
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
    agentId: policy.agentId,
    ensName: policy.ensName,
    createdAt: policy.metadata.createdAt,
    createdBy: policy.metadata.createdBy,
  };
}

export async function storePolicyDocument(
  policy: VCRPolicy,
  namespace: string,
): Promise<FileversePolicyResult> {
  const agent = getFileverseAgent();
  const baseNamespace = normalizePolicyNamespace(namespace);
  await agent.setupStorage(baseNamespace);

  // Fileverse stores public string content. We persist canonical JSON so the
  // resulting IPFS object is stable and machine-readable.
  const result = await agent.create(
    stringify(policy),
    buildFileversePolicyMetadata(policy),
  );
  const file = await agent.getFile(result.fileId);

  return {
    fileId: String(result.fileId),
    portalAddress: file.portal,
    namespace: baseNamespace,
    contentUri: file.contentIpfsHash,
    metadataUri: file.metadataIpfsHash,
    txHash: result.hash,
    activityUrl: getFileverseActivityUrl(),
  };
}

export async function appendPolicyVersion(
  policy: VCRPolicy,
  namespace: string,
): Promise<FileversePolicyResult> {
  return storePolicyDocument(policy, namespace);
}
