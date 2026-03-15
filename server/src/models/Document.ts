// ─── Document Model — Versioned Fileverse dDoc CID Registry ─────────────────
import mongoose, { type Document, Schema, Types } from "mongoose";

export interface IStoredDocumentVersion {
  cid: string;
  timestamp: Date;
  author?: string;
}

export interface IStoredDocument extends Document {
  title: string;
  cid?: string;
  currentCID: string;
  versions: IStoredDocumentVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const StoredDocumentVersionSchema = new Schema<IStoredDocumentVersion>(
  {
    cid: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now },
    author: { type: String, trim: true },
  },
  { _id: false },
);

const StoredDocumentSchema = new Schema<IStoredDocument>(
  {
    title: { type: String, required: true, trim: true },
    cid: { type: String, trim: true, index: true },
    currentCID: { type: String, required: true, trim: true, index: true },
    versions: {
      type: [StoredDocumentVersionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

StoredDocumentSchema.index({ "versions.cid": 1 });

export const StoredDocument = mongoose.model<IStoredDocument>(
  "StoredDocument",
  StoredDocumentSchema,
);

function normalizeCid(cid: string): string {
  const normalized = cid.trim();
  if (!normalized) {
    throw new Error("cid is required");
  }
  return normalized;
}

function normalizeOptionalAuthor(author?: string): string | undefined {
  const normalized = author?.trim();
  return normalized ? normalized : undefined;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function ensureVersionedShape(document: IStoredDocument): Promise<IStoredDocument> {
  const fallbackCid = document.currentCID?.trim() || document.cid?.trim() || "";
  if (!fallbackCid) {
    return document;
  }

  let changed = false;

  if (document.currentCID !== fallbackCid) {
    document.currentCID = fallbackCid;
    changed = true;
  }

  if (document.cid !== fallbackCid) {
    document.cid = fallbackCid;
    changed = true;
  }

  if (!Array.isArray(document.versions)) {
    document.versions = [];
    changed = true;
  }

  const hasFallbackInHistory = document.versions.some((version) => version.cid === fallbackCid);
  if (!hasFallbackInHistory) {
    document.versions.unshift({
      cid: fallbackCid,
      timestamp: document.updatedAt ?? new Date(),
    });
    changed = true;
  }

  if (changed) {
    await document.save();
  }

  return document;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

export async function saveStoredDocument(data: {
  title: string;
  cid: string;
  author?: string;
}): Promise<IStoredDocument> {
  const normalizedTitle = data.title.trim();
  if (!normalizedTitle) {
    throw new Error("title is required");
  }

  const initialCid = normalizeCid(data.cid);
  try {
    const created = await StoredDocument.create({
      title: normalizedTitle,
      cid: initialCid,
      currentCID: initialCid,
      versions: [
        {
          cid: initialCid,
          timestamp: new Date(),
          author: normalizeOptionalAuthor(data.author),
        },
      ],
    });

    return created;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await getStoredDocumentByCid(initialCid);
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

export async function getStoredDocumentByCid(cid: string): Promise<IStoredDocument | null> {
  const normalizedCid = normalizeCid(cid);
  const stored = await StoredDocument.findOne({
    $or: [
      { cid: normalizedCid },
      { currentCID: normalizedCid },
      { "versions.cid": normalizedCid },
    ],
  }).sort({ updatedAt: -1 });

  if (!stored) {
    return null;
  }

  return ensureVersionedShape(stored);
}

export async function getStoredDocumentById(id: string): Promise<IStoredDocument | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }

  const stored = await StoredDocument.findById(id);
  if (!stored) {
    return null;
  }

  return ensureVersionedShape(stored);
}

export async function appendStoredDocumentVersion(
  id: string,
  input: { cid: string; author?: string },
): Promise<IStoredDocument> {
  const document = await getStoredDocumentById(id);
  if (!document) {
    throw new Error("Document not found");
  }

  const nextCid = normalizeCid(input.cid);
  const currentCid = document.currentCID?.trim() || document.cid?.trim() || "";
  if (currentCid === nextCid) {
    if (document.cid !== nextCid || document.currentCID !== nextCid) {
      document.cid = nextCid;
      document.currentCID = nextCid;
      await document.save();
    }
    return document;
  }

  if (!Array.isArray(document.versions)) {
    document.versions = [];
  }

  if (currentCid && !document.versions.some((version) => version.cid === currentCid)) {
    document.versions.push({
      cid: currentCid,
      timestamp: document.updatedAt ?? new Date(),
    });
  }

  document.cid = nextCid;
  document.currentCID = nextCid;
  document.versions.push({
    cid: nextCid,
    timestamp: new Date(),
    author: normalizeOptionalAuthor(input.author),
  });

  await document.save();
  return document;
}

export async function restoreStoredDocumentVersion(
  id: string,
  cid: string,
): Promise<IStoredDocument> {
  const document = await getStoredDocumentById(id);
  if (!document) {
    throw new Error("Document not found");
  }

  const restoreCid = normalizeCid(cid);
  const existsInHistory = document.versions.some((version) => version.cid === restoreCid);
  if (!existsInHistory) {
    throw new Error("Requested CID is not part of this document's version history");
  }

  document.cid = restoreCid;
  document.currentCID = restoreCid;
  await document.save();
  return document;
}
