// ─── IPFS Routes — Upload dDoc JSON via Pinata ──────────────────────────────
import { Router } from "express";
import { PinataSDK } from "pinata";

const router = Router();

function getPinataClient() {
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    throw new Error("PINATA_JWT is required");
  }

  return new PinataSDK({
    pinataJwt,
    pinataGateway: process.env.PINATA_GATEWAY,
  });
}

/**
 * POST /api/ipfs/upload
 * Upload Fileverse dDoc editor JSON exactly as provided by the client.
 */
router.post("/upload", async (req, res) => {
  try {
    const payload = req.body as unknown;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        error: "A JSON object payload is required",
      });
    }

    const pinata = getPinataClient();
    const result = await pinata.upload.public.json(payload);
    const gatewayBase = process.env.PINATA_GATEWAY
      ? /^https?:\/\//i.test(process.env.PINATA_GATEWAY)
        ? process.env.PINATA_GATEWAY.replace(/\/+$/, "")
        : `https://${process.env.PINATA_GATEWAY.replace(/\/+$/, "")}`
      : "https://gateway.pinata.cloud";

    return res.status(201).json({
      cid: result.cid,
      ipfsUri: `ipfs://${result.cid}`,
      gatewayUrl: `${gatewayBase}/ipfs/${result.cid}`,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
