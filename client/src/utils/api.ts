import type { StoredDoc } from "../types/document";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function createStoredDocument(input: {
  title: string;
  cid: string;
}): Promise<StoredDoc> {
  return apiRequest<StoredDoc>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getStoredDocument(cid: string): Promise<StoredDoc> {
  return apiRequest<StoredDoc>(`/api/documents/${encodeURIComponent(cid)}`);
}
