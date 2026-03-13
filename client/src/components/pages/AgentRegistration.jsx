import { useState } from "react";
import { vcr } from "../../lib/api";

export default function AgentRegistration() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [ensName, setEnsName] = useState("");
  const [withPolicy, setWithPolicy] = useState(false);
  const [policyJson, setPolicyJson] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      let policy;
      if (withPolicy && policyJson) {
        try { policy = JSON.parse(policyJson); }
        catch { throw new Error("Invalid policy JSON"); }
      }
      const res = await vcr.registerAgent({
        name,
        description,
        services: endpoint ? [{ type: "api", endpoint }] : undefined,
        policy,
        ensName: ensName || undefined,
      });
      setResult(res);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ["Agent Info", "ENS Linking", "Policy (opt)", "Result"];

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <div className="page-header">
          <div className="badge badge-purple" style={{ marginBottom: 12 }}>ERC-8004 · ENSIP-25</div>
          <h1>Register an Agent</h1>
          <p>Create an on-chain autonomous agent identity, link your ENS name, and attach a spending policy</p>
        </div>

        <div className="steps">
          {STEPS.map((s, i) => (
            <button key={s} className={`step-tab${step === i ? " active" : ""}${step > i ? " done" : ""}`} onClick={() => setStep(i)}>
              <span className="step-num">{step > i ? "✓" : i + 1}</span>{s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="card">
            <div className="card-header"><h2>Agent Information</h2><p>Metadata stored on IPFS and used as the Agent URI in ERC-8004</p></div>
            <div className="form-group">
              <label className="form-label">Agent Name *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Research Assistant v1" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what this agent does..." />
            </div>
            <div className="form-group">
              <label className="form-label">Service Endpoint (optional)</label>
              <input className="form-input" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://my-agent.example.com/api" />
            </div>

            <div className="card" style={{ background: "rgba(167,139,250,0.05)", borderColor: "rgba(167,139,250,0.15)", marginTop: 16, padding: "16px 20px" }}>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--neon-purple)" }}>What happens:</strong><br />
                1. Agent metadata JSON is uploaded to IPFS (Pinata)<br />
                2. <code className="mono" style={{ fontSize: "0.78rem" }}>register(agentUri)</code> is called on ERC-8004 IdentityRegistry (Sepolia)<br />
                3. Transaction is confirmed and agentId is extracted from the event log<br />
                4. Final metadata with correct agentId is re-pinned
              </p>
            </div>

            <button className="btn btn-primary btn-full mt-6" onClick={() => setStep(1)} disabled={!name}>Next: ENS Linking →</button>
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <div className="card-header">
              <h2>ENS Linking (ENSIP-25)</h2>
              <p>Link your ENS name to the agent via a bidirectional text record</p>
            </div>

            <div className="alert alert-info" style={{ marginBottom: 20, fontSize: "0.85rem" }}>
              ENSIP-25 uses an ERC-7930-encoded text record key:<br />
              <code className="mono" style={{ fontSize: "0.78rem" }}>agent-registration[0x00010000b...&lt;registryAddr&gt;][agentId]</code>
            </div>

            <div className="form-group">
              <label className="form-label">ENS Name (optional)</label>
              <input className="form-input" value={ensName} onChange={e => setEnsName(e.target.value)} placeholder="youragent.eth" />
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>Leave empty to skip ENS linking</p>
            </div>

            <div className="divider" />
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <strong>Sepolia Registry used:</strong><br />
              <code className="mono" style={{ fontSize: "0.76rem", color: "var(--neon-blue)" }}>0x8004A818BFB912233c491871b3d84c89A494BD9e</code><br /><br />
              <strong>Chain ID:</strong> 11155111 (Sepolia)
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(2)}>Next: Policy →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <div className="card-header"><h2>Attach Policy (Optional)</h2><p>Pin a VCR policy and set the vcr.policy ENS record in one shot</p></div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
              <input type="checkbox" id="wp" checked={withPolicy} onChange={e => setWithPolicy(e.target.checked)} style={{ width: 16, height: 16 }} />
              <label htmlFor="wp" style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>
                Attach a VCR policy during registration
              </label>
            </div>

            {withPolicy && (
              <div className="form-group">
                <label className="form-label">Policy JSON</label>
                <textarea className="form-textarea" style={{ minHeight: 200, fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
                  value={policyJson} onChange={e => setPolicyJson(e.target.value)}
                  placeholder={`{\n  "version": "1.0",\n  "agentId": "...",\n  "constraints": { ... },\n  "metadata": { ... }\n}`} />
                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>
                  Or use the Policy Builder to create one first
                </p>
              </div>
            )}

            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div className="flex gap-3 mt-4">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading || !name}>
                {loading ? <><div className="spinner" />Registering on Sepolia…</> : "🚀 Register Agent"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="card">
            <div className="card-header"><h2>✅ Agent Registered!</h2></div>

            <div className="alert alert-success" style={{ marginBottom: 24 }}>
              Agent successfully registered on ERC-8004 IdentityRegistry (Sepolia)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "Agent ID", value: result.agentId?.toString() },
                { label: "Tx Hash", value: result.txHash },
                { label: "Agent URI (IPFS)", value: result.agentUri },
                result.policyCid && { label: "Policy CID", value: result.policyCid },
                result.policyUri && { label: "Policy URI", value: result.policyUri },
                result.ensTxHash && { label: "ENS Tx Hash", value: result.ensTxHash },
              ].filter(Boolean).map(item => item && (
                <div key={item.label}>
                  <label className="form-label">{item.label}</label>
                  <div className="code-block" style={{ padding: "10px 14px", wordBreak: "break-all", fontSize: "0.8rem" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn btn-ghost" onClick={() => { setResult(null); setStep(0); }}>Register Another</button>
              <a href={`https://sepolia.etherscan.io/tx/${result.txHash}`} target="_blank" rel="noreferrer" className="btn btn-outline">
                View on Etherscan ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
