import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DdocEditor } from "@fileverse-dev/ddoc";
import { getStoredDocumentById } from "../utils/api";
import { fetchDocumentFromIPFS } from "../utils/ipfs";
import { saveNewVersion } from "../utils/versionManager";
import type { StoredDoc } from "../types/document";

type JSONContent = Record<string, unknown> | null;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function EditDocPage() {
  const { id } = useParams();

  const [documentMeta, setDocumentMeta] = useState<StoredDoc | null>(null);
  const [initialContent, setInitialContent] = useState<JSONContent>(null);
  const [draftContent, setDraftContent] = useState<JSONContent>(null);
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [latestSavedCID, setLatestSavedCID] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing document id in route.");
      return;
    }

    const documentId: string = id;

    let active = true;

    async function loadEditorData() {
      setLoading(true);
      setError("");

      try {
        const stored = await getStoredDocumentById(documentId);
        if (!active) {
          return;
        }

        const currentCID = stored.currentCID || stored.cid;
        if (!currentCID) {
          throw new Error("Document has no current CID");
        }

        const ipfsContent = await fetchDocumentFromIPFS(currentCID);
        if (!active) {
          return;
        }

        if (!isJsonObject(ipfsContent)) {
          throw new Error("Current IPFS document is not valid JSON");
        }

        setDocumentMeta(stored);
        setInitialContent(ipfsContent);
        setDraftContent(ipfsContent);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError((loadError as Error).message || "Failed to load document editor");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadEditorData();

    return () => {
      active = false;
    };
  }, [id]);

  const editorKey = useMemo(() => {
    const currentCID = documentMeta?.currentCID || documentMeta?.cid || "new";
    return `${id ?? "unknown"}-${currentCID}`;
  }, [documentMeta?.currentCID, documentMeta?.cid, id]);

  const handleSaveVersion = async () => {
    if (!id || !draftContent) {
      setError("Document content is empty. Add content before saving.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const { cid, document } = await saveNewVersion(id, draftContent, author.trim() || undefined);
      setLatestSavedCID(cid);
      setDocumentMeta(document);
      setInitialContent(draftContent);
    } catch (saveError) {
      setError((saveError as Error).message || "Failed to save a new version");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1080 }}>
          <div className="card">
            <p>Loading editor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!id || !documentMeta) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1080 }}>
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error || "Document not found"}
          </div>
          <Link to="/doc/create" className="btn btn-ghost">Create a document</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1240 }}>
        <div className="page-header">
          <div className="badge badge-blue" style={{ marginBottom: 12 }}>Edit + Version</div>
          <h1>Edit Document</h1>
          <p>Each save uploads JSON to IPFS and records a new immutable CID in version history.</p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>{documentMeta.title}</h2>
            <p>Document ID: {id}</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="version-author">Version author (optional)</label>
            <input
              id="version-author"
              className="form-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {error ? (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          ) : null}

          {latestSavedCID ? (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              Saved new version CID: <span className="mono">{latestSavedCID}</span>
            </div>
          ) : null}

          <div
            style={{
              border: "3px solid var(--nb-ink)",
              boxShadow: "4px 4px 0 var(--nb-ink)",
              background: "#fff",
              padding: 12,
              marginBottom: 18,
            }}
          >
            <DdocEditor
              key={editorKey}
              initialContent={initialContent}
              onChange={(doc) => setDraftContent((doc ?? null) as JSONContent)}
              documentStyling={{
                canvasBackground: "#ffffff",
                textColor: "#000000",
                fontFamily: "Inter, sans-serif",
              }}
              editorCanvasClassNames="max-w-3xl mx-auto"
            />
          </div>

          <div className="wizard-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-primary" onClick={handleSaveVersion} disabled={saving}>
              {saving ? "Saving Version..." : "Save Version"}
            </button>
            <Link to={`/doc/id/${id}`} className="btn btn-ghost">Back to version history</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
