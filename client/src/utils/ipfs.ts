import { API_BASE } from "./api";

function getConfiguredGatewayBase(): string {
  const configured = import.meta.env.VITE_IPFS_GATEWAY || "https://ipfs.io/ipfs";
  return configured.replace(/\/+$/, "");
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

export async function fetchDocumentFromIPFS(cid: string): Promise<unknown> {
  const url = buildIpfsGatewayUrl(cid);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to load IPFS document (${res.status})`);
  }

  return res.json();
}
