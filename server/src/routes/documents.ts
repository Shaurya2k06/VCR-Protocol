// ─── Document Routes — Persist Fileverse dDoc CIDs ──────────────────────────
import { Router } from "express";
import {
  appendStoredDocumentVersion,
  getStoredDocumentByCid,
  getStoredDocumentById,
  restoreStoredDocumentVersion,
  saveStoredDocument,
  type IStoredDocument,
} from "../models/Document.js";

const router = Router();

function serializeStoredDocument(document: IStoredDocument) {
  return {
    _id: document._id,
    title: document.title,
    currentCID: document.currentCID,
    cid: document.currentCID,
    versions: document.versions.map((version) => ({
      cid: version.cid,
      timestamp: version.timestamp,
      author: version.author,
    })),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/**
 * POST /api/documents
 * Create a new versioned document registry entry.
 */
router.post("/", async (req, res) => {
  try {
    const { title, cid, author } = req.body as {
      title?: unknown;
      cid?: unknown;
      author?: unknown;
    };

    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedCid = typeof cid === "string" ? cid.trim() : "";
    const normalizedAuthor = typeof author === "string" ? author.trim() : undefined;

    if (!normalizedTitle) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!normalizedCid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const stored = await saveStoredDocument({
      title: normalizedTitle,
      cid: normalizedCid,
      author: normalizedAuthor,
    });

    return res.status(201).json(serializeStoredDocument(stored));
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/documents/id/:id
 * Fetch document metadata by database id.
 */
router.get("/id/:id", async (req, res) => {
  try {
    const id = req.params.id?.trim();
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const stored = await getStoredDocumentById(id);
    if (!stored) {
      return res.status(404).json({ error: "Document not found" });
    }

    return res.json(serializeStoredDocument(stored));
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/documents/by-cid/:cid
 * Fetch stored document metadata by current or historical CID.
 */
router.get("/by-cid/:cid", async (req, res) => {
  try {
    const cid = req.params.cid?.trim();
    if (!cid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const stored = await getStoredDocumentByCid(cid);
    if (!stored) {
      return res.status(404).json({ error: "Document not found" });
    }

    return res.json(serializeStoredDocument(stored));
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/documents/:id/versions
 * List all CID versions for a document id.
 */
router.get("/:id/versions", async (req, res) => {
  try {
    const id = req.params.id?.trim();
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const stored = await getStoredDocumentById(id);
    if (!stored) {
      return res.status(404).json({ error: "Document not found" });
    }

    return res.json({
      _id: stored._id,
      currentCID: stored.currentCID,
      versions: stored.versions.map((version) => ({
        cid: version.cid,
        timestamp: version.timestamp,
        author: version.author,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/documents/:id/version
 * Append a new immutable CID version and set it as current.
 */
router.post("/:id/version", async (req, res) => {
  try {
    const id = req.params.id?.trim();
    const { cid, author } = req.body as {
      cid?: unknown;
      author?: unknown;
    };

    const normalizedId = typeof id === "string" ? id : "";
    const normalizedCid = typeof cid === "string" ? cid.trim() : "";
    const normalizedAuthor = typeof author === "string" ? author.trim() : undefined;

    if (!normalizedId) {
      return res.status(400).json({ error: "id is required" });
    }
    if (!normalizedCid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const updated = await appendStoredDocumentVersion(normalizedId, {
      cid: normalizedCid,
      author: normalizedAuthor,
    });

    return res.json(serializeStoredDocument(updated));
  } catch (err) {
    const message = (err as Error).message;
    if (message === "Document not found") {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/documents/:id/restore
 * Restore a previous CID as the current document pointer.
 */
router.post("/:id/restore", async (req, res) => {
  try {
    const id = req.params.id?.trim();
    const { cid } = req.body as {
      cid?: unknown;
    };

    const normalizedId = typeof id === "string" ? id : "";
    const normalizedCid = typeof cid === "string" ? cid.trim() : "";

    if (!normalizedId) {
      return res.status(400).json({ error: "id is required" });
    }
    if (!normalizedCid) {
      return res.status(400).json({ error: "cid is required" });
    }

    const restored = await restoreStoredDocumentVersion(normalizedId, normalizedCid);
    return res.json(serializeStoredDocument(restored));
  } catch (err) {
    const message = (err as Error).message;
    if (message === "Document not found") {
      return res.status(404).json({ error: message });
    }
    if (message.includes("version history")) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/documents/:cid
 * Legacy alias: resolve document metadata by CID.
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

    return res.json(serializeStoredDocument(stored));
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
