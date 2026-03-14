// ─── Document Routes — Persist Fileverse dDoc CIDs ──────────────────────────
import { Router } from "express";
import { getStoredDocumentByCid, saveStoredDocument } from "../models/Document.js";

const router = Router();

/**
 * POST /api/documents
 * Save a document reference (title + CID) in MongoDB.
 */
router.post("/", async (req, res) => {
  try {
    const { title, cid } = req.body as {
      title?: unknown;
      cid?: unknown;
    };

    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedCid = typeof cid === "string" ? cid.trim() : "";

    if (!normalizedTitle) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!normalizedCid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const stored = await saveStoredDocument({
      title: normalizedTitle,
      cid: normalizedCid,
    });

    return res.status(201).json({
      _id: stored._id,
      title: stored.title,
      cid: stored.cid,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/documents/:cid
 * Fetch stored document metadata by CID.
 */
router.get("/:cid", async (req, res) => {
  try {
    const cid = req.params.cid?.trim();
    if (!cid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const stored = await getStoredDocumentByCid(cid);
    if (!stored) {
      return res.status(404).json({ error: "Document not found" });
    }

    return res.json({
      _id: stored._id,
      title: stored.title,
      cid: stored.cid,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
