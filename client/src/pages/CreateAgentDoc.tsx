import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStoredDocument } from "../utils/api";
import { createAgentDoc } from "../utils/createDocJSON";
import { uploadDocToIPFS } from "../utils/ipfs";
import type { AgentDocInput } from "../types/doc";

const DEFAULT_AGENT_DATA: AgentDocInput = {
  name: "",
  description: "",
  model: "",
  strategy: "",
};

export default function CreateAgentDoc() {
  const navigate = useNavigate();
  const [agentData, setAgentData] = useState<AgentDocInput>(DEFAULT_AGENT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFieldChange =
    (field: keyof AgentDocInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setAgentData((current) => ({
        ...current,
        [field]: value,
      }));
    };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!agentData.name.trim()) {
      setError("Agent name is required");
      return;
    }

    setLoading(true);

    try {
      const docJSON = createAgentDoc({
        name: agentData.name.trim(),
        description: agentData.description,
        model: agentData.model,
        strategy: agentData.strategy,
      });

      const cid = await uploadDocToIPFS(docJSON);

      await createStoredDocument({
        title: agentData.name.trim(),
        cid,
      });

      navigate(`/doc/${cid}`);
    } catch (submitError) {
      setError((submitError as Error).message || "Failed to create agent document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="page-header">
          <div className="badge badge-blue" style={{ marginBottom: 12 }}>Programmatic dDoc</div>
          <h1>Create Agent Document</h1>
          <p>Generate Fileverse dDoc JSON from agent data, upload to IPFS, store the CID, and open the immutable viewer.</p>
        </div>

        <form className="card" onSubmit={handleSubmit}>
          <div className="card-header">
            <h2>Agent Data</h2>
            <p>This form is transformed directly into ProseMirror JSON (no Markdown/HTML).</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="agent-name">Name</label>
            <input
              id="agent-name"
              className="form-input"
              value={agentData.name}
              onChange={handleFieldChange("name")}
              placeholder="Latency Arbitrage Agent"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="agent-description">Description</label>
            <textarea
              id="agent-description"
              className="form-textarea"
              rows={4}
              value={agentData.description}
              onChange={handleFieldChange("description")}
              placeholder="This agent performs exchange arbitrage within defined limits."
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="agent-model">Model</label>
              <input
                id="agent-model"
                className="form-input"
                value={agentData.model}
                onChange={handleFieldChange("model")}
                placeholder="gpt-4.1-mini"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="agent-strategy">Strategy</label>
              <input
                id="agent-strategy"
                className="form-input"
                value={agentData.strategy}
                onChange={handleFieldChange("strategy")}
                placeholder="Cross-exchange spread capture"
              />
            </div>
          </div>

          {error ? (
            <div className="alert alert-error" style={{ marginTop: 20, marginBottom: 0 }}>
              {error}
            </div>
          ) : null}

          <div className="wizard-actions" style={{ marginTop: 24 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Generating + Publishing..." : "Generate & Publish Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
