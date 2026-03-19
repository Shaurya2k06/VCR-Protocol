export interface FileverseStorePolicyResult {
  cid: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function extractCid(payload: unknown): string | undefined {
  const root = asObject(payload);
  if (!root) {
    return undefined;
  }

  const directCandidates = ["cid", "ipfsCid", "ipfs_cid"];
  for (const key of directCandidates) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const data = asObject(root.data);
  if (data) {
    for (const key of directCandidates) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return undefined;
}

export async function storePolicyWithFileverse(
  policy: unknown,
  options?: { signal?: AbortSignal },
): Promise<FileverseStorePolicyResult> {
  const endpoint = process.env.FILEVERSE_API_URL?.trim();
  if (!endpoint) {
    throw new Error("FILEVERSE_API_URL is not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.FILEVERSE_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ policy }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      details
        ? `Fileverse request failed (${response.status}): ${details}`
        : `Fileverse request failed (${response.status})`,
    );
  }

  const payload = await response.json().catch(() => null);
  const cid = extractCid(payload);

  if (!cid) {
    throw new Error("Fileverse response did not include a CID");
  }

  return { cid };
}
