import { useState } from "react";
import { vcr } from "../../lib/api";

const DEFAULT_CONSTRAINTS = {
  maxTransaction: { amount: "1000000", token: "USDC", chain: "base-sepolia" },
  dailyLimit: { amount: "10000000", token: "USDC", chain: "base-sepolia" },
  allowedRecipients: ["0x"],
  allowedTokens: ["USDC"],
  allowedChains: ["base-sepolia"],
  timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
};

export default function PolicyBuilder() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Form state
  const [agentId, setAgentId] = useState("eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0");
  const [description, setDescription] = useState("My agent spending policy");
  const [createdBy, setCreatedBy] = useState("0x");
  const [expiresAt, setExpiresAt] = useState("");

  const [maxAmount, setMaxAmount] = useState("1000000");
  const [dailyAmount, setDailyAmount] = useState("10000000");
  const [token, setToken] = useState("USDC");
  const [chain, setChain] = useState("base-sepolia");
  const [recipients, setRecipients] = useState("0x");
  const [tokens, setTokens] = useState("USDC");
  const [chains, setChains] = useState("base-sepolia");
  const [startHour, setStartHour] = useState("0");
  const [endHour, setEndHour] = useState("24");

  const [ensName, setEnsName] = useState("");
  const [agentIdNum, setAgentIdNum] = useState("");
  const [setENS, setSetENS] = useState(false);

  const buildBody = () => ({
    agentId,
    constraints: {
      maxTransaction: { amount: maxAmount, token, chain },
      dailyLimit: { amount: dailyAmount, token, chain },
      allowedRecipients: recipients.split(",").map((s) => s.trim()).filter(Boolean),
      allowedTokens: tokens.split(",").map((s) => s.trim()).filter(Boolean),
      allowedChains: chains.split(",").map((s) => s.trim()).filter(Boolean),
      timeRestrictions: { timezone: "UTC", allowedHours: [parseInt(startHour), parseInt(endHour)] },
    },
    metadata: { createdBy, description, expiresAt: expiresAt || undefined },
    ...(setENS && ensName ? { ensName, agentIdNumber: parseInt(agentIdNum), setENS: true } : {}),
  });

  const preview = JSON.stringify(buildBody().constraints, null, 2);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await vcr.createPolicy(buildBody());
      setResult(res);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ["Agent ID", "Constraints", "ENS & Publish", "Result"];

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-blue" style={{ marginBottom: 12 }}>Policy Builder</div>
          <h1>Create a VCR Policy</h1>
          <p>Define spending constraints for your agent, pin to IPFS, and anchor via ENS</p>
        </div>

        {/* Step tabs */}
        <div className="steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`step-tab${step === i ? " active" : ""}${step > i ? " done" : ""}`}
              onClick={() => setStep(i)}
            >
              <span className="step-num">{step > i ? "✓" : i + 1}</span>
              {s}
            </button>
          ))}
        </div>

        <div className="grid-2">
          {/* Left: form */}
          <div>
            {step === 0 && (
              <div className="card">
                <div className="card-header"><h2>Agent Identification</h2><p>The fully-qualified ERC-8004 agent ID</p></div>
                <div className="form-group">
                  <label className="form-label">Agent ID</label>
                  <input className="form-input" value={agentId} onChange={e => setAgentId(e.target.value)}
                    placeholder="eip155:11155111:0x8004A818...:0" />
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Format: eip155:&lt;chainId&gt;:&lt;registryAddress&gt;:&lt;agentId&gt;
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Created By (owner address)</label>
                  <input className="form-input mono" value={createdBy} onChange={e => setCreatedBy(e.target.value)} placeholder="0x..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Expires At (optional ISO date)</label>
                  <input className="form-input" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-full mt-4" onClick={() => setStep(1)}>Next: Constraints →</button>
              </div>
            )}

            {step === 1 && (
              <div className="card">
                <div className="card-header"><h2>Spending Constraints</h2><p>Define what the agent is allowed to spend</p></div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Max per-tx (base units)</label>
                    <input className="form-input mono" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>1 USDC = 1,000,000</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Daily limit (base units)</label>
                    <input className="form-input mono" value={dailyAmount} onChange={e => setDailyAmount(e.target.value)} />
                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>10 USDC = 10,000,000</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Token</label>
                    <input className="form-input" value={token} onChange={e => setToken(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Chain</label>
                    <input className="form-input" value={chain} onChange={e => setChain(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Allowed Recipients (comma-separated addresses)</label>
                  <textarea className="form-textarea" style={{ minHeight: 72 }} value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="0xabc..., 0xdef..." />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Allowed Tokens (comma-separated)</label>
                    <input className="form-input" value={tokens} onChange={e => setTokens(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Allowed Chains (comma-separated)</label>
                    <input className="form-input" value={chains} onChange={e => setChains(e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Hour (UTC 0–23)</label>
                    <input className="form-input" type="number" min="0" max="23" value={startHour} onChange={e => setStartHour(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Hour (UTC 1–24)</label>
                    <input className="form-input" type="number" min="1" max="24" value={endHour} onChange={e => setEndHour(e.target.value)} />
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(2)}>Next: ENS & Publish →</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="card">
                <div className="card-header"><h2>ENS & Publish</h2><p>Pin to IPFS and optionally set ENS records</p></div>

                <div style={{ padding: "14px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "var(--radius-md)", marginBottom: 20 }}>
                  <p style={{ fontSize: "0.82rem", color: "var(--neon-amber)" }}>
                    ⚠ The signing wallet (PRIVATE_KEY in server .env) will submit all ENS transactions on Sepolia.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  <input
                    type="checkbox"
                    id="setENS"
                    checked={setENS}
                    onChange={e => setSetENS(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <label htmlFor="setENS" style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>
                    Also set ENS text records (agent-registration + vcr.policy)
                  </label>
                </div>

                {setENS && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ENS Name</label>
                      <input className="form-input" value={ensName} onChange={e => setEnsName(e.target.value)} placeholder="youragent.eth" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Agent ID (number)</label>
                      <input className="form-input mono" type="number" value={agentIdNum} onChange={e => setAgentIdNum(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                )}

                {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                <div className="flex gap-3 mt-4">
                  <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
                    {loading ? <><div className="spinner" />Pinning to IPFS…</> : "📌 Pin Policy to IPFS"}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && result && (
              <div className="card">
                <div className="card-header"><h2>🎉 Policy Created!</h2><p>Successfully pinned and anchored</p></div>

                <div className="alert alert-success" style={{ marginBottom: 20 }}>
                  Policy pinned to IPFS and ready to use
                </div>

                <div className="form-group">
                  <label className="form-label">CID</label>
                  <div className="code-block" style={{ padding: "10px 14px" }}>{result.cid}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">IPFS URI</label>
                  <div className="code-block" style={{ padding: "10px 14px", wordBreak: "break-all" }}>{result.ipfsUri}</div>
                </div>

                {result.ensTxHash && (
                  <div className="form-group">
                    <label className="form-label">ENS Tx Hash</label>
                    <div className="code-block" style={{ padding: "10px 14px", wordBreak: "break-all" }}>{result.ensTxHash}</div>
                  </div>
                )}

                <button className="btn btn-ghost btn-full mt-4" onClick={() => { setResult(null); setStep(0); }}>
                  Build Another
                </button>
              </div>
            )}
          </div>

          {/* Right: JSON preview */}
          <div>
            <div className="card" style={{ position: "sticky", top: 80 }}>
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <h2>Policy Preview</h2>
                  <span className="badge badge-gray mono" style={{ fontSize: "0.72rem" }}>JSON</span>
                </div>
              </div>
              <pre className="code-block" style={{ maxHeight: 480, overflow: "auto" }}>
                {preview}
              </pre>
              <div className="divider" />
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                <div>• Amounts in base units (USDC: 6 decimals)</div>
                <div>• allowedHours is UTC [start, end)</div>
                <div>• JSON pinned via Pinata for deterministic CID</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
