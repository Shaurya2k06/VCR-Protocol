import { restoreDocumentVersion, saveDocumentVersion } from "./api";
import { uploadDocumentToIPFS } from "./ipfs";
import type { StoredDoc } from "../types/document";

export async function saveNewVersion(
  docId: string,
  content: unknown,
  author?: string,
): Promise<{ cid: string; document: StoredDoc }> {
  const cid = await uploadDocumentToIPFS(content);
  const document = await saveDocumentVersion(docId, { cid, author });
  return { cid, document };
}

export async function restoreVersion(
  docId: string,
  cid: string,
): Promise<StoredDoc> {
  return restoreDocumentVersion(docId, cid);
}
