import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DocViewer from "../components/DocViewer";
import VersionHistory from "../components/VersionHistory";
import { getStoredDocumentById } from "../utils/api";
import { buildIpfsGatewayUrl } from "../utils/ipfs";
import { restoreVersion } from "../utils/versionManager";
import type { StoredDoc } from "../types/document";

export default function ViewDocPage() {
  const { id } = useParams();

  const [documentMeta, setDocumentMeta] = useState<StoredDoc | null>(null);
  const [selectedCID, setSelectedCID] = useState("");
  const [restoringCID, setRestoringCID] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing document id in route.");
      return;
    }

    const documentId: string = id;

    let active = true;

    async function loadDocument() {
      setLoading(true);
      setError("");

      try {
        const stored = await getStoredDocumentById(documentId);
        if (!active) {
          return;
        }

        setDocumentMeta(stored);
        setSelectedCID(stored.currentCID || stored.cid || "");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError((loadError as Error).message || "Failed to load document");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      active = false;
    };
  }, [id]);

  const handleRestoreVersion = async (cid: string) => {
    if (!id) {
      return;
    }

    setError("");
    setRestoringCID(cid);

    try {
      const updated = await restoreVersion(id, cid);
      setDocumentMeta(updated);
      setSelectedCID(updated.currentCID || cid);
    } catch (restoreError) {
      setError((restoreError as Error).message || "Failed to restore document version");
    } finally {
      setRestoringCID(null);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1080 }}>
          <div className="card">
            <p>Loading document metadata...</p>
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

  const currentCID = documentMeta.currentCID || documentMeta.cid || "";
  const activeCID = selectedCID || currentCID;

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1240 }}>
        <div className="page-header">
          <div className="badge badge-purple" style={{ marginBottom: 12 }}>Versioned dDoc</div>
          <h1>{documentMeta.title}</h1>
          <p>Current CID is loaded from the database. Every save creates a new immutable CID in history.</p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2>Document Metadata</h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="code-block">Document ID: {id}</div>
            <div className="code-block">Current CID: {currentCID}</div>
            <div className="code-block">Viewing CID: {activeCID}</div>
          </div>
          <div className="wizard-actions" style={{ marginTop: 16 }}>
            <Link to={`/doc/edit/${id}`} className="btn btn-primary">Edit document</Link>
            {currentCID ? (
              <a href={buildIpfsGatewayUrl(currentCID)} target="_blank" rel="noreferrer" className="btn btn-ghost">
                Open current CID
              </a>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            {error}
          </div>
        ) : null}

        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            {activeCID ? (
              <DocViewer cid={activeCID} />
            ) : (
              <div className="card">
                <div className="alert alert-error">No CID available to render.</div>
              </div>
            )}
          </div>

          <VersionHistory
            versions={documentMeta.versions || []}
            currentCID={currentCID}
            selectedCID={activeCID}
            restoringCID={restoringCID}
            onViewVersion={(cid) => setSelectedCID(cid)}
            onRestoreVersion={handleRestoreVersion}
          />
        </div>
      </div>
    </div>
  );
}
