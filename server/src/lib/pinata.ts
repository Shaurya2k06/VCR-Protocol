import { PinataSDK } from "pinata";

export interface PinataUploadResult {
  cid: string;
  ipfsUri: string;
}

function getGatewayBaseUrl(): string {
  const configured = process.env.PINATA_GATEWAY?.trim();
  if (!configured) {
    return "https://gateway.pinata.cloud";
  }

  const normalized = configured.replace(/\/+$/, "");
  return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
}

function extractPinataHash(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const candidates = [payload.IpfsHash, payload.cid];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

async function uploadJsonWithJwt(payload: Record<string, unknown>): Promise<string> {
  const pinataJwt = process.env.PINATA_JWT?.trim();
  if (!pinataJwt) {
    throw new Error("PINATA_JWT is not configured");
  }

  const pinata = new PinataSDK({
    pinataJwt,
    pinataGateway: process.env.PINATA_GATEWAY,
  });

  const result = await pinata.upload.public.json(payload);
  return result.cid;
}

async function uploadJsonWithKeySecret(payload: Record<string, unknown>): Promise<string> {
  const pinataKey = process.env.PINATA_KEY?.trim() || process.env.PINATA_API_KEY?.trim();
  const pinataSecret = process.env.PINATA_SECRET?.trim() || process.env.PINATA_API_SECRET?.trim();

  if (!pinataKey || !pinataSecret) {
    throw new Error("Pinata credentials are missing");
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: pinataKey,
      pinata_secret_api_key: pinataSecret,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const reason =
      (body as Record<string, unknown> | null)?.error ??
      (body as Record<string, unknown> | null)?.message;
    throw new Error(
      typeof reason === "string"
        ? `Pinata upload failed (${response.status}): ${reason}`
        : `Pinata upload failed (${response.status})`,
    );
  }

  const cid = extractPinataHash(body);
  if (!cid) {
    throw new Error("Pinata response did not include a CID");
  }

  return cid;
}

async function uploadJson(payload: Record<string, unknown>): Promise<string> {
  if (process.env.PINATA_JWT?.trim()) {
    return uploadJsonWithJwt(payload);
  }

  return uploadJsonWithKeySecret(payload);
}

export async function uploadTextDocumentToPinata(
  textContent: string,
  options?: { agentId?: string },
): Promise<PinataUploadResult> {
  const payload = {
    contentType: "text/plain",
    content: textContent,
    metadata: {
      source: "agent-creation-fallback",
      agentId: options?.agentId ?? null,
      createdAt: new Date().toISOString(),
    },
  };

  const cid = await uploadJson(payload);
  return {
    cid,
    ipfsUri: `ipfs://${cid}`,
  };
}

export function buildPinataGatewayUrl(cid: string): string {
  return `${getGatewayBaseUrl()}/ipfs/${cid}`;
}
