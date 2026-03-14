import { API_BASE } from "./api";
import type { FileverseDocJSON } from "../types/doc";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getConfiguredGatewayBase(): string {
  const configured = import.meta.env.VITE_IPFS_GATEWAY || "https://ipfs.io/ipfs";
  return configured.replace(/\/+$/, "");
}

function getFallbackGatewayUrls(cid: string): string[] {
  return Array.from(
    new Set([
      buildIpfsGatewayUrl(cid),
      `https://dweb.link/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
    ]),
  );
}

async function fetchGatewayJson(url: string): Promise<JsonObject> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!isJsonObject(payload)) {
    throw new Error("Gateway response was not a JSON object");
  }

  return payload;
}

export function buildIpfsGatewayUrl(cid: string): string {
  const base = getConfiguredGatewayBase();
  if (base.endsWith("/ipfs")) {
    return `${base}/${cid}`;
  }
  return `${base}/ipfs/${cid}`;
}

export function extractCidFromValue(value: string): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("ipfs://")) {
    return normalized.slice("ipfs://".length).split("/")[0] || null;
  }

  try {
    const parsed = new URL(normalized);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const ipfsIndex = segments.findIndex((segment) => segment === "ipfs");
    if (ipfsIndex >= 0 && segments[ipfsIndex + 1]) {
      return segments[ipfsIndex + 1];
    }
  } catch {
    if (!normalized.includes("/") && !normalized.includes(":")) {
      return normalized;
    }
  }

  return null;
}

export async function uploadDocumentToIPFS(content: unknown): Promise<string> {
  if (!isJsonObject(content)) {
    throw new Error("Document content must be a JSON object");
  }

  const res = await fetch(`${API_BASE}/api/ipfs/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.cid) {
    throw new Error(data?.error || `IPFS upload failed (${res.status})`);
  }

  return data.cid as string;
}

export async function uploadDocToIPFS(doc: FileverseDocJSON): Promise<string> {
  return uploadDocumentToIPFS(doc);
}

export async function fetchDocumentFromIPFS(cid: string): Promise<unknown> {
  const normalizedCid = cid.trim();
  if (!normalizedCid) {
    throw new Error("CID is required");
  }

  try {
    const apiResponse = await fetch(
      `${API_BASE}/api/ipfs/${encodeURIComponent(normalizedCid)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );

    const apiPayload = await apiResponse.json().catch(() => null);
    if (apiResponse.ok && isJsonObject(apiPayload)) {
      return apiPayload;
    }
  } catch {
    // Fall back to direct gateway fetching.
  }

  const gatewayErrors: string[] = [];
  for (const gatewayUrl of getFallbackGatewayUrls(normalizedCid)) {
    try {
      return await fetchGatewayJson(gatewayUrl);
    } catch (err) {
      gatewayErrors.push(`${gatewayUrl} -> ${(err as Error).message}`);
    }
  }

  throw new Error(
    gatewayErrors[0]
      ? `Failed to load IPFS document. ${gatewayErrors[0]}`
      : "Failed to load IPFS document",
  );
}
