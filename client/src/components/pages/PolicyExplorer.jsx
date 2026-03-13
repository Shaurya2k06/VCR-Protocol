import { useState } from "react";
import { vcr } from "../../lib/api";

export default function PolicyExplorer() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("policy");

  const explore = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setHistory(null);
    try {
      const [policyRes, histRes] = await Promise.allSettled([
        vcr.getPolicy(search.trim()),
        vcr.getHistory(search.trim()),
      ]);
      if (policyRes.status === "fulfilled") setResult(policyRes.value);
      else setError(policyRes.reason.message);
      if (histRes.status === "fulfilled") setHistory(histRes.value);
    } finally {
      setLoading(false);
    }
  };

  const policy = result?.policy;
  const c = policy?.constraints;

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-amber" style={{ marginBottom: 12 }}>ENS + IPFS Lookup</div>
          <h1>Policy Explorer</h1>
          <p>Search any ENS name to resolve its VCR policy from IPFS and inspect its constraints</p>
        </div>

        {/* Search */}
        <form onSubmit={explore} style={{ display: "flex", gap: 12, maxWidth: 560, margin: "0 auto 56px" }}>
          <input
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="youragent.eth"
            style={{ flex: 1, fontSize: "1rem" }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !search.trim()}>
            {loading ? <div className="spinner" /> : "Search"}
          </button>
        </form>

        {error && (
          <div className="alert alert-error" style={{ maxWidth: 640, margin: "0 auto 32px" }}>
            {error}
          </div>
        )}

        {result && policy && (
          <>
            {/* Header */}
            <div className="card" style={{ marginBottom: 24, background: "linear-gradient(135deg, rgba(99,210,255,0.05), rgba(167,139,250,0.05))" }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="status-dot green" />
                    <span className="badge badge-green">Active Policy</span>
                    <span className="badge badge-gray mono">v{policy.version}</span>
                  </div>
                  <h2 style={{ fontSize: "1.4rem" }}>{result.ensName}</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                    {result.policyUri}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Created</div>
                  <div style={{ fontSize: "0.875rem" }}>{new Date(policy.metadata?.createdAt).toLocaleDateString()}</div>
                  {policy.metadata?.expiresAt && (
                    <>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Expires</div>
                      <div style={{ fontSize: "0.875rem", color: "var(--neon-amber)" }}>{new Date(policy.metadata.expiresAt).toLocaleDateString()}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {["policy", "constraints", "raw", "history"].map(t => (
                <button key={t} className={`tab-btn${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === "policy" && (
              <div className="grid-3">
                <div className="card">
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Max Transaction</h2></div>
                  <div style={{ fontSize: "2rem", fontFamily: "var(--font-mono)", color: "var(--neon-blue)", fontWeight: 700 }}>
                    {c?.maxTransaction?.amount}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                    {c?.maxTransaction?.token} · {c?.maxTransaction?.chain}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Daily Limit</h2></div>
                  <div style={{ fontSize: "2rem", fontFamily: "var(--font-mono)", color: "var(--neon-purple)", fontWeight: 700 }}>
                    {c?.dailyLimit?.amount}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                    {c?.dailyLimit?.token} · {c?.dailyLimit?.chain}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Time Window</h2></div>
                  <div style={{ fontSize: "1.5rem", fontFamily: "var(--font-mono)", color: "var(--neon-amber)", fontWeight: 700 }}>
                    {c?.timeRestrictions ? `${c.timeRestrictions.allowedHours[0]}:00 – ${c.timeRestrictions.allowedHours[1]}:00` : "Unrestricted"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>UTC</div>
                </div>
              </div>
            )}

            {activeTab === "constraints" && (
              <div className="grid-2">
                <div className="card">
                  <div className="card-header"><h2>Allowed Tokens</h2></div>
                  <div className="flex gap-2 flex-wrap">
                    {c?.allowedTokens?.map(t => <span key={t} className="badge badge-green">{t}</span>)}
                  </div>

                  <div className="divider" />

                  <div className="card-header"><h2>Allowed Chains</h2></div>
                  <div className="flex gap-2 flex-wrap">
                    {c?.allowedChains?.map(ch => <span key={ch} className="badge badge-blue">{ch}</span>)}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h2>Allowed Recipients</h2>
                    <p>{c?.allowedRecipients?.length} addresses whitelisted</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {c?.allowedRecipients?.map(addr => (
                      <div key={addr} className="code-block truncate" style={{ padding: "8px 12px", fontSize: "0.78rem" }}>{addr}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "raw" && (
              <pre className="code-block" style={{ maxHeight: 500, overflow: "auto" }}>
                {JSON.stringify(policy, null, 2)}
              </pre>
            )}

            {activeTab === "history" && (
              <div className="card">
                <div className="card-header"><h2>Spend History</h2><p>Last 30 days of recorded spend</p></div>
                {!history?.history?.length ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>No spend history found</div>
                ) : (
                  <div>
                    {history.history.map((row, i) => (
                      <div key={i} className="tx-row">
                        <div className="status-dot blue" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{row.date}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{row.token}</div>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", color: "var(--neon-amber)", fontSize: "0.875rem" }}>
                          {row.amountSpent}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!result && !loading && !error && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔭</div>
            <p>Enter an ENS name above to explore its VCR policy</p>
          </div>
        )}
      </div>
    </div>
  );
}
