import { useEffect, useMemo, useState } from "react";
import { DdocEditor } from "@fileverse-dev/ddoc";
import { getStoredDocument } from "../utils/api";
import { buildIpfsGatewayUrl, fetchDocumentFromIPFS } from "../utils/ipfs";
import type { StoredDoc } from "../types/document";

interface DocViewerProps {
  cid: string;
}

type JsonObject = Record<string, unknown>;
type DdocContent = JsonObject & {
  type: "doc";
  content: unknown[];
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDdocContent(value: unknown): value is DdocContent {
  return (
    isJsonObject(value) &&
    value.type === "doc" &&
    Array.isArray((value as JsonObject).content)
  );
}

function createTextParagraph(text: string): JsonObject {
  return {
    type: "paragraph",
    content: [{ type: "text", text: text.length ? text : " " }],
  };
}

function normalizeToDdocContent(value: unknown): {
  content: DdocContent;
  normalizedFromNonNative: boolean;
} {
  if (isDdocContent(value)) {
    return {
      content: value,
      normalizedFromNonNative: false,
    };
  }

  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const lines = raw ? raw.split("\n").slice(0, 500) : ["Empty document"];

  return {
    normalizedFromNonNative: true,
    content: {
      type: "doc",
      content: lines.map(createTextParagraph),
    },
  };
}

export default function DocViewer({ cid }: DocViewerProps) {
  const [documentContent, setDocumentContent] = useState<DdocContent | null>(null);
  const [documentMeta, setDocumentMeta] = useState<StoredDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [normalizedFromNonNative, setNormalizedFromNonNative] = useState(false);

  const rawIpfsUrl = useMemo(() => buildIpfsGatewayUrl(cid), [cid]);

  useEffect(() => {
    let active = true;

    async function loadDocument() {
      setLoading(true);
      setError("");

      try {
        const [ipfsResult, dbResult] = await Promise.allSettled([
          fetchDocumentFromIPFS(cid),
          getStoredDocument(cid),
        ]);

        if (!active) {
          return;
        }

        if (ipfsResult.status === "rejected") {
          throw ipfsResult.reason;
        }

        const normalized = normalizeToDdocContent(ipfsResult.value);
        setDocumentContent(normalized.content);
        setNormalizedFromNonNative(normalized.normalizedFromNonNative);

        if (dbResult.status === "fulfilled") {
          setDocumentMeta(dbResult.value);
        } else {
          setDocumentMeta(null);
        }
      } catch (viewError) {
        if (!active) {
          return;
        }

        setDocumentContent(null);
        setNormalizedFromNonNative(false);
        setError((viewError as Error).message || "Failed to load document");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      active = false;
    };
  }, [cid]);

  const downloadJson = () => {
    if (!documentContent) {
      return;
    }

    const blob = new Blob([JSON.stringify(documentContent, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${cid}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <p>Loading document from IPFS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
        <a className="btn btn-ghost" href={rawIpfsUrl} target="_blank" rel="noreferrer">
          Open Raw IPFS
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{documentMeta?.title || "Document Viewer"}</h2>
        <p className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{cid}</p>
      </div>

      <div className="wizard-actions" style={{ marginTop: 0, marginBottom: 18 }}>
        <button type="button" className="btn btn-ghost" onClick={downloadJson}>
          Download JSON
        </button>
        <a className="btn btn-primary" href={rawIpfsUrl} target="_blank" rel="noreferrer">
          Open Raw IPFS
        </a>
      </div>

      {normalizedFromNonNative && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          This file was not native dDoc editor JSON. It has been converted to a safe read-only preview.
        </div>
      )}

      <div
        style={{
          border: "3px solid var(--nb-ink)",
          boxShadow: "4px 4px 0 var(--nb-ink)",
          background: "#fff",
          padding: 12,
        }}
      >
        <DdocEditor
          key={`${cid}-${normalizedFromNonNative ? "fallback" : "native"}`}
          initialContent={documentContent}
          isPreviewMode={true}
          editorCanvasClassNames="max-w-3xl mx-auto"
          documentStyling={{
            canvasBackground: "#ffffff",
            textColor: "#000000",
            fontFamily: "Inter, sans-serif",
          }}
        />
      </div>
    </div>
  );
}
