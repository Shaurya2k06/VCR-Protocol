import { useState } from "react";
import { DdocEditor } from "@fileverse-dev/ddoc";

export type JSONContent = Record<string, unknown> | null;

interface DocEditorProps {
  onPublish: (payload: { title: string; content: JSONContent }) => Promise<void>;
  isPublishing?: boolean;
  publishError?: string;
}

export default function DocEditor({
  onPublish,
  isPublishing = false,
  publishError = "",
}: DocEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<JSONContent>(null);
  const [localError, setLocalError] = useState("");

  const handlePublish = async () => {
    if (!title.trim()) {
      setLocalError("Document title is required");
      return;
    }

    if (!content) {
      setLocalError("Please add some content before publishing");
      return;
    }

    setLocalError("");
    await onPublish({ title: title.trim(), content });
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Create dDoc</h2>
        <p>Write your rules document using Fileverse editor and publish directly to IPFS.</p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="doc-title">Document title</label>
        <input
          id="doc-title"
          className="form-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Agent spend policy"
        />
      </div>

      {(localError || publishError) && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {localError || publishError}
        </div>
      )}

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
          initialContent={content}
          onChange={(doc) => setContent((doc ?? null) as JSONContent)}
          documentStyling={{
            canvasBackground: "#ffffff",
            textColor: "#000000",
            fontFamily: "Inter, sans-serif",
          }}
          editorCanvasClassNames="max-w-3xl mx-auto"
        />
      </div>

      <button type="button" className="btn btn-primary" onClick={handlePublish} disabled={isPublishing}>
        {isPublishing ? "Publishing..." : "Publish to IPFS"}
      </button>
    </div>
  );
}
