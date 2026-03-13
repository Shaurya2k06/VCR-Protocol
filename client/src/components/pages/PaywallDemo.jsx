import { useState } from "react";
import { vcr } from "../../lib/api";

const STEP_ICONS = ["👤", "🚧", "📜", "🌐", "✉️", "🔍", "✅", "💰", "🎉"];
const STEP_LABELS = [
  "Agent → Paywall",
  "Server → 402",
  "Parse PAYMENT-REQUIRED",
  "canAgentSpend() check",
  "Sign EIP-3009",
  "Facilitator /verify",
  "Facilitator /settle",
  "Record spend",
  "200 + Content",
];

function FlowNode({ label, icon, status, detail }) {
  const cls = `flow-node${status === "active" ? " active" : ""}${status === "success" ? " success" : ""}${status === "blocked" ? " blocked" : ""}`;
  return (
    <div className={cls} style={{ minWidth: 130 }}>
      <div style={{ fontSize: "1.4rem" }}>{icon}</div>
      <div style={{ marginTop: 6, fontSize: "0.72rem", lineHeight: 1.4 }}>{label}</div>
      {detail && <div style={{ fontSize: "0.65rem", marginTop: 4, opacity: 0.7 }}>{detail}</div>}
    </div>
  );
}

export default function PaywallDemo() {
  const [ensName, setEnsName] = useState("");
  const [amount, setAmount] = useState("100000");
  const [token, setToken] = useState("USDC");
  const [chain, setChain] = useState("base-sepolia");
  const [recipient, setRecipient] = useState("0x0000000000000000000000000000000000000001");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(-1);

  const simulate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setActiveStep(-1);

    try {
      // Animate steps before API call
      for (let i = 0; i < STEP_LABELS.length; i++) {
        setActiveStep(i);
        await new Promise(r => setTimeout(r, 300));
      }

      const res = await vcr.simulate({ ensName, amount, token, chain, recipient });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setActiveStep(-1);
    }
  };

  const getNodeStatus = (index) => {
    if (!result) {
      if (loading && index === activeStep) return "active";
      return "idle";
    }
    const steps = result.steps ?? [];
    const step = steps[index];
    if (!step) return "idle";
    if (step.status === "ok") return "success";
    if (step.status === "fail") return "blocked";
    return "idle";
  };

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-red" style={{ marginBottom: 12, gap: 6 }}>
            <span className="status-dot amber" />x402 · VCR · EIP-3009
          </div>
          <h1>x402 Paywall Demo</h1>
          <p>Simulate the full agent → VCR check → x402 payment → content delivery flow</p>
        </div>

        <div className="grid-2">
          {/* Config */}
          <div>
            <div className="card">
              <div className="card-header"><h2>Simulation Setup</h2></div>

              <div className="form-group">
                <label className="form-label">Agent ENS Name</label>
                <input className="form-input" value={ensName} onChange={e => setEnsName(e.target.value)} placeholder="youragent.eth" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (base units)</label>
                  <input className="form-input mono" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Token</label>
                  <input className="form-input" value={token} onChange={e => setToken(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Paywall Recipient</label>
                <input className="form-input mono" value={recipient} onChange={e => setRecipient(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Network</label>
                <input className="form-input" value={chain} onChange={e => setChain(e.target.value)} />
              </div>

              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              <button className="btn btn-primary btn-full" onClick={simulate} disabled={loading || !ensName}>
                {loading ? <><div className="spinner" />Simulating…</> : "▶ Run x402 + VCR Simulation"}
              </button>

              {/* Protocol reference */}
              <div className="divider" />
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
                <strong style={{ color: "var(--text-primary)" }}>x402 V2 Headers:</strong>
                <div className="code-block" style={{ marginTop: 8, padding: "10px 14px", fontSize: "0.74rem" }}>
                  {`PAYMENT-REQUIRED   → server to client\nPAYMENT-SIGNATURE  → client to server\nPAYMENT-RESPONSE   → server to client`}
                </div>
              </div>
            </div>

            {/* EIP-3009 reference */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>EIP-3009 Signature Structure</h2></div>
              <pre className="code-block" style={{ fontSize: "0.72rem", padding: "12px 14px" }}>
{`TransferWithAuthorization {
  from:        address
  to:          address (paywall)
  value:       uint256 (amount)
  validAfter:  uint256 (0)
  validBefore: uint256 (now + 1h)
  nonce:       bytes32 (random)
}

Domain: USD Coin v2
Chain: base-sepolia (84532)`}
              </pre>
            </div>
          </div>

          {/* Flow visualization */}
          <div>
            <div className="card" style={{ minHeight: 500 }}>
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <h2>Protocol Flow</h2>
                  {result && (
                    <span className={`badge ${result.success ? "badge-green" : "badge-red"}`}>
                      {result.success ? "✓ Paid & Delivered" : "✗ Blocked"}
                    </span>
                  )}
                </div>
              </div>

              {/* Step flow */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {STEP_LABELS.map((label, i) => {
                  const step = result?.steps?.[i];
                  const status = getNodeStatus(i);
                  const isActive = loading && i === activeStep;

                  return (
                    <div key={label} className="flex items-center gap-3" style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: isActive ? "rgba(99,210,255,0.06)" : "transparent", transition: "background 0.2s" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem",
                        background: status === "success" ? "rgba(74,222,128,0.15)" : status === "blocked" ? "rgba(248,113,113,0.15)" : status === "active" ? "rgba(99,210,255,0.15)" : "var(--bg-card)",
                        color: status === "success" ? "var(--neon-green)" : status === "blocked" ? "var(--neon-red)" : status === "active" ? "var(--neon-blue)" : "var(--text-muted)",
                        border: `1px solid ${status === "success" ? "rgba(74,222,128,0.3)" : status === "blocked" ? "rgba(248,113,113,0.3)" : status === "active" ? "rgba(99,210,255,0.3)" : "var(--border)"}`,
                      }}>
                        {status === "success" ? "✓" : status === "blocked" ? "✗" : isActive ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : i + 1}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, fontFamily: "var(--font-display)", color: status === "success" ? "var(--neon-green)" : status === "blocked" ? "var(--neon-red)" : isActive ? "var(--neon-blue)" : "var(--text-secondary)" }}>
                          {label}
                        </div>
                        {step?.detail && (
                          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 2 }}>{step.detail}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Result summary */}
              {result && (
                <>
                  <div className="divider" />
                  {result.success ? (
                    <div className="alert alert-success" style={{ fontSize: "0.85rem" }}>
                      🎉 Payment settled! Daily spend now: <strong>{result.dailySpentAfter} {token}</strong> base units
                    </div>
                  ) : (
                    <div className="alert alert-error" style={{ fontSize: "0.85rem" }}>
                      Blocked at step {result.blockedAt}: {result.reason}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
