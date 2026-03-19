import type { DocumentVersion, StoredDoc } from "../types/document";

export const API_BASE = import.meta.env.VITE_API_URL || "https://vcr-protocol-ylgy.onrender.com";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!isJson) {
    const preview = typeof payload === "string"
      ? payload.replace(/\s+/g, " ").slice(0, 120)
      : "";
    throw new Error(
      `Unexpected response from API at ${path}: expected JSON but received ${contentType || "unknown content type"}. ` +
      `Verify VITE_API_URL points to the backend service.${preview ? ` Response preview: ${preview}` : ""}`,
    );
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && payload.error) ||
      (payload && typeof payload === "object" && "message" in payload && payload.message) ||
      `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function createStoredDocument(input: {
  title: string;
  cid: string;
  author?: string;
}): Promise<StoredDoc> {
  return apiRequest<StoredDoc>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getStoredDocumentByCid(cid: string): Promise<StoredDoc> {
  return apiRequest<StoredDoc>(`/api/documents/by-cid/${encodeURIComponent(cid)}`);
}

export async function getStoredDocumentById(id: string): Promise<StoredDoc> {
  return apiRequest<StoredDoc>(`/api/documents/id/${encodeURIComponent(id)}`);
}

export async function getStoredDocument(cid: string): Promise<StoredDoc> {
  return getStoredDocumentByCid(cid);
}

export async function saveDocumentVersion(
  id: string,
  input: { cid: string; author?: string },
): Promise<StoredDoc> {
  return apiRequest<StoredDoc>(`/api/documents/${encodeURIComponent(id)}/version`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function restoreDocumentVersion(
  id: string,
  cid: string,
): Promise<StoredDoc> {
  return apiRequest<StoredDoc>(`/api/documents/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    body: JSON.stringify({ cid }),
  });
}

export async function getDocumentVersions(id: string): Promise<{
  _id: string;
  currentCID: string;
  versions: DocumentVersion[];
}> {
  return apiRequest<{
    _id: string;
    currentCID: string;
    versions: DocumentVersion[];
  }>(`/api/documents/${encodeURIComponent(id)}/versions`);
}
