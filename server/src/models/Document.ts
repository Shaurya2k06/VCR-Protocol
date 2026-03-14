// ─── Document Model — Fileverse dDoc CID Registry ───────────────────────────
import mongoose, { type Document, Schema } from "mongoose";

export interface IStoredDocument extends Document {
  title: string;
  cid: string;
  createdAt: Date;
  updatedAt: Date;
}

const StoredDocumentSchema = new Schema<IStoredDocument>(
  {
    title: { type: String, required: true, trim: true },
    cid: { type: String, required: true, unique: true, index: true, trim: true },
  },
  { timestamps: true },
);

export const StoredDocument = mongoose.model<IStoredDocument>(
  "StoredDocument",
  StoredDocumentSchema,
);

// ─── Helper Functions ─────────────────────────────────────────────────────────

export async function saveStoredDocument(data: {
  title: string;
  cid: string;
}): Promise<IStoredDocument> {
  const result = await StoredDocument.findOneAndUpdate(
    { cid: data.cid },
    {
      $set: {
        title: data.title,
      },
      $setOnInsert: {
        cid: data.cid,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  if (!result) {
    throw new Error("Failed to save document metadata");
  }

  return result;
}

export async function getStoredDocumentByCid(cid: string): Promise<IStoredDocument | null> {
  return StoredDocument.findOne({ cid: cid.trim() });
}
