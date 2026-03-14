import fs from "fs/promises";
import path from "path";

import { buildPolicyGatewayUrl, setVCRPolicyRecord } from "./ens.js";
import {
  appendPolicyVersion,
  buildPolicyNamespace,
  normalizePolicyNamespace,
} from "./fileverse.js";
import { ERC8004_ADDRESSES } from "./erc8004.js";
import type {
  AgentRecord,
  PolicyVersionRecord,
  UpdateAgentPolicyConfig,
  VCRPolicy,
} from "./types.js";

function seedExistingPolicyVersion(record: AgentRecord): PolicyVersionRecord[] {
  if (record.policyVersions?.length) {
    return [...record.policyVersions];
  }

  return [
    {
      policyCid: record.policyCid,
      policyUri: record.policyUri,
      policyGatewayUrl: record.policyGatewayUrl,
      policyFileId: record.policyFileId,
      policyPortalAddress: record.policyPortalAddress,
      policyNamespace: record.policyNamespace,
      ensTx: record.ensTx,
      createdAt: record.createdAt,
    },
  ];
}

export async function updateAgentPolicy(
  config: UpdateAgentPolicyConfig,
): Promise<AgentRecord> {
  const recordPath = path.resolve(config.recordPath);
  const raw = await fs.readFile(recordPath, "utf8");
  const record = JSON.parse(raw) as AgentRecord & { walletPassphrase?: string };

  const policy: VCRPolicy = {
    version: "1.0",
    agentId: `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}:${record.agentId}`,
    constraints: config.constraints,
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: record.registryWalletAddress ?? "",
      description: config.description ?? `Updated VCR policy for ${record.ensName}`,
      expiresAt: config.expiresAt,
    },
    ensName: record.ensName,
    walletAddress: record.walletAddress,
    custodian: "bitgo",
    network: "hteth",
    policy_hash: record.policyHash,
  };

  const namespace = normalizePolicyNamespace(
    record.policyNamespace ?? buildPolicyNamespace(record.ensName.split(".")[0] ?? "agent"),
  );
  const storedPolicy = await appendPolicyVersion(policy, namespace);
  const policyUri = storedPolicy.contentUri;
  const policyCid = policyUri.startsWith("ipfs://") ? policyUri.slice(7) : policyUri;
  const policyGatewayUrl = buildPolicyGatewayUrl(policyUri);
  const ensResult = await setVCRPolicyRecord(record.ensName, policyUri);

  const updatedRecord: AgentRecord & { walletPassphrase?: string } = {
    ...record,
    policyCid,
    policyUri,
    policyGatewayUrl,
    policyFileId: storedPolicy.fileId,
    policyPortalAddress: storedPolicy.portalAddress,
    policyNamespace: storedPolicy.namespace,
    ensTx: ensResult.txHash,
    policyVersions: [
      ...seedExistingPolicyVersion(record),
      {
        policyCid,
        policyUri,
        policyGatewayUrl,
        policyFileId: storedPolicy.fileId,
        policyPortalAddress: storedPolicy.portalAddress,
        policyNamespace: storedPolicy.namespace,
        ensTx: ensResult.txHash,
        createdAt: policy.metadata.createdAt,
      },
    ],
  };

  await fs.writeFile(recordPath, JSON.stringify(updatedRecord, null, 2), "utf8");
  return updatedRecord;
}
