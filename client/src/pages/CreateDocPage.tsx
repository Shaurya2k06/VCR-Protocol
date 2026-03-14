import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DocEditor, { type JSONContent } from "../components/DocEditor";
import { createStoredDocument } from "../utils/api";
import { uploadDocumentToIPFS } from "../utils/ipfs";

export default function CreateDocPage() {
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const handlePublish = async (payload: {
    title: string;
    content: JSONContent;
  }) => {
    setPublishing(true);
    setError("");

    try {
      const cid = await uploadDocumentToIPFS(payload.content);

      await createStoredDocument({
        title: payload.title,
        cid,
      });

      navigate(`/doc/${cid}`);
    } catch (publishError) {
      setError((publishError as Error).message || "Failed to publish document");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1080 }}>
        <div className="page-header">
          <div className="badge badge-blue" style={{ marginBottom: 12 }}>Fileverse dDoc</div>
          <h1>Create Document</h1>
          <p>Create a Google Docs-style policy document, publish to IPFS, and store CID in MongoDB.</p>
        </div>

        <DocEditor onPublish={handlePublish} isPublishing={publishing} publishError={error} />
      </div>
    </div>
  );
}
