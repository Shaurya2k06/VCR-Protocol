// ─── IPFS Routes — Upload dDoc JSON via Pinata ──────────────────────────────
import { Router } from "express";
import { PinataSDK } from "pinata";

const router = Router();

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLikelyCid(value: string): boolean {
  const normalized = value.trim();
  return /^[a-zA-Z0-9]+$/.test(normalized) && normalized.length >= 20;
}

function getGatewayBaseUrl(): string {
  const configured = process.env.PINATA_GATEWAY;
  if (!configured) {
    return "https://gateway.pinata.cloud";
  }

  const trimmed = configured.replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildGatewayCandidates(cid: string): string[] {
  return Array.from(
    new Set([
      `${getGatewayBaseUrl()}/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
    ]),
  );
}

async function fetchIpfsJsonFromGateway(url: string): Promise<JsonObject> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (!isJsonObject(payload)) {
      throw new Error("Gateway response was not a JSON object");
    }

    return payload;
  } catch (err) {
    const error = err as Error;
    if (error.name === "AbortError") {
      throw new Error("Gateway request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadWithJwt(payload: Record<string, unknown>): Promise<string> {
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

async function uploadWithKeySecret(payload: Record<string, unknown>): Promise<string> {
  const pinataKey =
    process.env.PINATA_KEY?.trim() || process.env.PINATA_API_KEY?.trim();
  const pinataSecret =
    process.env.PINATA_SECRET?.trim() || process.env.PINATA_API_SECRET?.trim();

  if (!pinataKey || !pinataSecret) {
    throw new Error("PINATA_KEY/PINATA_SECRET are not configured");
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

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.IpfsHash) {
    const reason = data?.error?.reason || data?.error || data?.message;
    throw new Error(reason || `Pinata upload failed (${response.status})`);
  }

  return data.IpfsHash as string;
}

async function uploadJsonToIpfs(payload: Record<string, unknown>): Promise<string> {
  if (process.env.PINATA_JWT?.trim()) {
    return uploadWithJwt(payload);
  }

  if (
    process.env.PINATA_KEY?.trim() ||
    process.env.PINATA_API_KEY?.trim()
  ) {
    return uploadWithKeySecret(payload);
  }

  throw new Error(
    "Pinata credentials are missing. Configure PINATA_JWT or PINATA_KEY/PINATA_SECRET",
  );
}

/**
 * POST /api/ipfs/upload
 * Upload Fileverse dDoc editor JSON exactly as provided by the client.
 */
router.post("/upload", async (req, res) => {
  try {
    const payload = req.body as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({
        error: "A JSON object payload is required",
      });
    }

    const cid = await uploadJsonToIpfs(payload as Record<string, unknown>);
    const gatewayBase = getGatewayBaseUrl();

    return res.status(201).json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${gatewayBase}/ipfs/${cid}`,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/ipfs/:cid
 * Fetch dDoc JSON from IPFS with gateway fallbacks.
 */
router.get("/:cid", async (req, res) => {
  const cid = req.params.cid?.trim();
  if (!cid || !isLikelyCid(cid)) {
    return res.status(400).json({ error: "A valid CID is required" });
  }

  const gateways = buildGatewayCandidates(cid);
  const attempts: string[] = [];

  for (const gatewayUrl of gateways) {
    try {
      const document = await fetchIpfsJsonFromGateway(gatewayUrl);
      res.setHeader("x-ipfs-gateway", gatewayUrl);
      return res.json(document);
    } catch (err) {
      attempts.push(`${gatewayUrl} -> ${(err as Error).message}`);
    }
  }

  return res.status(502).json({
    error: "Failed to fetch document JSON from IPFS gateways",
    cid,
    attemptedGateways: gateways,
    details: attempts,
  });
});

export default router;
