import { useState } from "react";
import { vcr } from "../../lib/api";

const CHECKS = [
  { key: "maxTransaction", label: "Max Transaction" },
  { key: "allowedRecipients", label: "Recipient Whitelist" },
  { key: "allowedTokens", label: "Token Allowlist" },
  { key: "allowedChains", label: "Chain Allowlist" },
  { key: "timeRestrictions", label: "Time Window (UTC)" },
  { key: "dailyLimit", label: "Daily Cumulative Limit" },
];

function CheckRow({ label, status, detail }) {
  const color = status === "pass" ? "var(--neon-green)" : status === "fail" ? "var(--neon-red)" : "var(--text-muted)";
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "–";
  return (
    <div className="flex items-center gap-3" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${color}18`, border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color, flexShrink: 0, fontWeight: 700 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>{label}</div>
        {detail && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{detail}</div>}
      </div>
    </div>
  );
}

export default function SpendVerifier() {
  const [ensName, setEnsName] = useState("");
  const [amount, setAmount] = useState("100000");
  const [token, setToken] = useState("USDC");
  const [recipient, setRecipient] = useState("0x");
  const [chain, setChain] = useState("base-sepolia");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Also track daily spend
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailySpent, setDailySpent] = useState(null);

  const verify = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await vcr.verify(ensName, { amount, token, recipient, chain });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const checkDaily = async () => {
    setDailyLoading(true);
    try {
      const res = await vcr.getDailySpent(ensName, token);
      setDailySpent(res.dailySpent);
    } catch (e) {
      setDailySpent("error");
    } finally {
      setDailyLoading(false);
    }
  };

  // Map result to check statuses
  const getChecks = () => {
    if (!result?.result?.policy) return CHECKS.map(c => ({ ...c, status: "idle" }));
    const { allowed, reason, policy } = result.result;
    const c = policy.constraints;

    if (allowed) return CHECKS.map(c => ({ ...c, status: "pass" }));

    // Find which check failed
    const failedChecks = {
      maxTransaction: reason?.includes("max transaction"),
      allowedRecipients: reason?.includes("Recipient"),
      allowedTokens: reason?.includes("Token"),
      allowedChains: reason?.includes("Chain"),
      timeRestrictions: reason?.includes("hours"),
      dailyLimit: reason?.includes("Daily"),
    };

    return CHECKS.map(check => ({
      ...check,
      status: failedChecks[check.key] ? "fail" : "pass",
      detail: failedChecks[check.key] ? reason : undefined,
    }));
  };

  const checks = getChecks();
  const isPassed = result?.result?.allowed === true;
  const isFailed = result?.result?.allowed === false;

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-green" style={{ marginBottom: 12 }}>canAgentSpend()</div>
          <h1>Spend Verifier</h1>
          <p>Test whether a proposed payment passes an agent's VCR policy constraints</p>
        </div>

        <div className="grid-2">
          {/* Input */}
          <div>
            <div className="card">
              <div className="card-header"><h2>Spend Request</h2><p>Fill in the details of the proposed payment</p></div>

              <div className="form-group">
                <label className="form-label">Agent ENS Name</label>
                <input className="form-input" value={ensName} onChange={e => setEnsName(e.target.value)} placeholder="youragent.eth" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (base units)</label>
                  <input className="form-input mono" value={amount} onChange={e => setAmount(e.target.value)} />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>USDC: 100000 = $0.10</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Token</label>
                  <input className="form-input" value={token} onChange={e => setToken(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Recipient Address</label>
                <input className="form-input mono" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x..." />
              </div>

              <div className="form-group">
                <label className="form-label">Chain</label>
                <input className="form-input" value={chain} onChange={e => setChain(e.target.value)} placeholder="base-sepolia" />
              </div>

              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              <button className="btn btn-primary btn-full" onClick={verify} disabled={loading || !ensName}>
                {loading ? <><div className="spinner" />Checking…</> : "🔍 Run canAgentSpend()"}
              </button>

              <div className="divider" />

              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>Daily Spend Today</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{token} base units consumed today</div>
                </div>
                <div className="flex items-center gap-3">
                  {dailySpent !== null && (
                    <span className="mono" style={{ fontSize: "0.9rem", color: "var(--neon-amber)" }}>{dailySpent}</span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={checkDaily} disabled={!ensName || dailyLoading}>
                    {dailyLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : "Check"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Result */}
          <div>
            <div className="card" style={{ minHeight: 400 }}>
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <h2>Constraint Checks</h2>
                  {result && (
                    <span className={`badge ${isPassed ? "badge-green" : "badge-red"}`}>
                      {isPassed ? "✓ ALLOWED" : "✗ BLOCKED"}
                    </span>
                  )}
                </div>
              </div>

              {!result && !loading && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔍</div>
                  <p>Enter an ENS name and spend request,<br />then run the verifier</p>
                </div>
              )}

              {loading && (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: "0 auto 16px" }} />
                  <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    Fetching ENS → IPFS → checking 9 constraints…
                  </p>
                </div>
              )}

              {result && (
                <>
                  <div className={`alert ${isPassed ? "alert-success" : "alert-error"}`} style={{ marginBottom: 20 }}>
                    {isPassed ? "✅ All policy constraints passed — payment is allowed" : `❌ ${result.result.reason}`}
                  </div>

                  <div>
                    {checks.map(c => (
                      <CheckRow key={c.key} label={c.label} status={c.status} detail={c.detail} />
                    ))}
                  </div>

                  {result.result?.policy && (
                    <>
                      <div className="divider" />
                      <div style={{ fontSize: "0.78rem" }}>
                        <div className="form-label" style={{ marginBottom: 8 }}>Policy Source</div>
                        <div className="code-block" style={{ fontSize: "0.75rem", padding: "10px 14px" }}>
                          {JSON.stringify(result.result.policy.metadata, null, 2)}
                        </div>
                      </div>
                    </>
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
