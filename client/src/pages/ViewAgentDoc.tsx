import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DocViewer from "../components/DocViewer";
import { createStoredDocument, getStoredDocumentByCid } from "../utils/api";

export default function ViewAgentDoc() {
  const navigate = useNavigate();
  const { cid } = useParams();
  const [historyDocId, setHistoryDocId] = useState("");
  const [resolvingHistory, setResolvingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const resolveOrCreateHistoryDocumentId = async (targetCid: string): Promise<string> => {
    if (historyDocId) {
      return historyDocId;
    }

    try {
      const stored = await getStoredDocumentByCid(targetCid);
      const resolvedId = stored._id || "";

      if (!resolvedId) {
        throw new Error("Failed to resolve version history ID.");
      }

      setHistoryDocId(resolvedId);
      return resolvedId;
    } catch (lookupError) {
      const message = (lookupError as Error).message || "";
      const isNotFound =
        message.toLowerCase().includes("document not found") || message.includes("404");

      if (!isNotFound) {
        throw lookupError;
      }
    }

    const created = await createStoredDocument({
      title: `Agent Document ${targetCid.slice(0, 8)}`,
      cid: targetCid,
      author: "system",
    });

    const createdId = created._id || "";
    if (!createdId) {
      throw new Error("Failed to initialize version history for this document.");
    }

    setHistoryDocId(createdId);
    return createdId;
  };

  useEffect(() => {
    if (!cid) {
      setHistoryDocId("");
      setHistoryError("");
      return;
    }

    let active = true;

    async function resolveHistory() {
      setResolvingHistory(true);

      try {
        const stored = await getStoredDocumentByCid(cid);
        if (!active) {
          return;
        }

        setHistoryDocId(stored._id || "");
      } catch {
        if (active) {
          setHistoryDocId("");
        }
      } finally {
        if (active) {
          setResolvingHistory(false);
        }
      }
    }

    void resolveHistory();

    return () => {
      active = false;
    };
  }, [cid]);

  const handleOpenPolicyHistory = async () => {
    if (!cid) {
      return;
    }

    setHistoryError("");
    setResolvingHistory(true);

    try {
      const resolvedDocId = await resolveOrCreateHistoryDocumentId(cid);

      navigate(`/doc/id/${resolvedDocId}`);
    } catch (openError) {
      setHistoryError((openError as Error).message || "Failed to open version history");
    } finally {
      setResolvingHistory(false);
    }
  };

  if (!cid) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 920 }}>
          <div className="alert alert-error">Missing CID in route.</div>
          <Link to="/doc/create" className="btn btn-ghost">Create an agent document</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1080 }}>
        <div className="page-header">
          <div className="badge badge-purple" style={{ marginBottom: 12 }}>Fileverse dDoc</div>
          <h1>View Agent Document</h1>
          <p>Document is fetched from IPFS by CID and rendered with Fileverse editor in preview mode.</p>
          <div className="wizard-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleOpenPolicyHistory()}
              disabled={resolvingHistory}
            >
              {resolvingHistory ? "Opening history..." : "View Agent Policy History"}
            </button>
          </div>
          {historyError ? <div className="alert alert-error" style={{ marginTop: 12 }}>{historyError}</div> : null}
        </div>

        <DocViewer cid={cid} />
      </div>
    </div>
  );
}
