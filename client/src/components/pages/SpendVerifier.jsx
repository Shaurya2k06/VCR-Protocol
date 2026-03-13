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
  const color =
    status === "pass"
      ? "var(--neon-green)"
      : status === "fail"
        ? "var(--neon-red)"
        : "var(--text-muted)";
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "–";

  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: `${color}18`,
          border: `1px solid ${color}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          color,
          flexShrink: 0,
          fontWeight: 700,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            fontFamily: "var(--font-display)",
          }}
        >
          {label}
        </div>
        {detail ? (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: 2,
              wordBreak: "break-word",
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LogRow({ log }) {
  const badgeClass =
    log.status === "completed"
      ? "badge-green"
      : log.status === "rejected" || log.status === "failed"
        ? "badge-red"
        : "badge-gray";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        background: "var(--bg-card)",
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <div
          style={{
            fontSize: "0.84rem",
            fontWeight: 600,
            fontFamily: "var(--font-display)",
          }}
        >
          {log.type}
        </div>
        <span className={`badge ${badgeClass}`}>{log.status}</span>
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: "0.76rem",
          color: "var(--text-muted)",
          lineHeight: 1.7,
        }}
      >
        <div>
          Amount: <span className="mono">{log.amount}</span> {log.token}
        </div>
        <div>
          Recipient: <span className="mono">{log.recipient}</span>
        </div>
        <div>
          Chain: <span className="mono">{log.chain}</span>
        </div>
        <div>
          Allowed:{" "}
          <span className="mono">{log.vcrAllowed ? "true" : "false"}</span>
        </div>
        {log.vcrReason ? <div>Reason: {log.vcrReason}</div> : null}
        <div>
          Time:{" "}
          <span className="mono">
            {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SpendVerifier() {
  const [ensName, setEnsName] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [recipient, setRecipient] = useState("");
  const [chain, setChain] = useState("");

  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [dailySpent, setDailySpent] = useState(null);
  const [error, setError] = useState("");

  const verify = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await vcr.verify(ensName.trim(), {
        amount: amount.trim(),
        token: token.trim(),
        recipient: recipient.trim(),
        chain: chain.trim(),
      });
      setResult(res);
      await loadLogs(ensName.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (targetEnsName = ensName.trim()) => {
    if (!targetEnsName) return;

    setLogsLoading(true);
    try {
      const res = await vcr.getLogs(targetEnsName);
      setLogs(Array.isArray(res.logs) ? res.logs : []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const checkDaily = async () => {
    if (!ensName.trim() || !token.trim()) return;

    setDailyLoading(true);
    try {
      const res = await vcr.getDailySpent(ensName.trim(), token.trim());
      setDailySpent(res.dailySpent);
    } catch (e) {
      setDailySpent("error");
    } finally {
      setDailyLoading(false);
    }
  };

  const getChecks = () => {
    if (!result?.result?.policy) {
      return CHECKS.map((c) => ({ ...c, status: "idle" }));
    }

    const { allowed, reason } = result.result;

    if (allowed) {
      return CHECKS.map((c) => ({ ...c, status: "pass" }));
    }

    const failedChecks = {
      maxTransaction: reason?.toLowerCase().includes("max transaction"),
      allowedRecipients:
        reason?.toLowerCase().includes("recipient") ||
        reason?.toLowerCase().includes("whitelist"),
      allowedTokens: reason?.toLowerCase().includes("token"),
      allowedChains: reason?.toLowerCase().includes("chain"),
      timeRestrictions:
        reason?.toLowerCase().includes("hours") ||
        reason?.toLowerCase().includes("time"),
      dailyLimit: reason?.toLowerCase().includes("daily"),
    };

    return CHECKS.map((check) => ({
      ...check,
      status: failedChecks[check.key] ? "fail" : "pass",
      detail: failedChecks[check.key] ? reason : undefined,
    }));
  };

  const checks = getChecks();
  const isPassed = result?.result?.allowed === true;
  const isFailed = result?.result?.allowed === false;
  const canVerify =
    ensName.trim() &&
    amount.trim() &&
    token.trim() &&
    recipient.trim() &&
    chain.trim();

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-green" style={{ marginBottom: 12 }}>
            canAgentSpend()
          </div>
          <h1>Spend Verifier</h1>
          <p>
            Run live backend verification against an ENS-linked agent policy and
            inspect the stored verification logs
          </p>
        </div>

        <div className="grid-2">
          <div>
            <div className="card">
              <div className="card-header">
                <h2>Live Spend Request</h2>
                <p>
                  Enter actual values from your registered agent and backend
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Agent ENS Name</label>
                <input
                  className="form-input"
                  value={ensName}
                  onChange={(e) => setEnsName(e.target.value)}
                  placeholder="agent.yourdomain.eth"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (base units)</label>
                  <input
                    className="form-input mono"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 100000"
                  />
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Use real token base units from your policy
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Token</label>
                  <input
                    className="form-input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="USDC"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Recipient Address</label>
                <input
                  className="form-input mono"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Chain</label>
                <input
                  className="form-input"
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                  placeholder="base-sepolia"
                />
              </div>

              {error ? (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              ) : null}

              <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={verify}
                  disabled={loading || !canVerify}
                >
                  {loading ? (
                    <>
                      <div className="spinner" />
                      Checking…
                    </>
                  ) : (
                    "🔍 Run Verification"
                  )}
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={checkDaily}
                  disabled={!ensName.trim() || !token.trim() || dailyLoading}
                >
                  {dailyLoading ? (
                    <>
                      <div className="spinner" />
                      Loading Daily Spend…
                    </>
                  ) : (
                    "Check Daily Spend"
                  )}
                </button>

                <button
                  className="btn btn-outline"
                  onClick={() => loadLogs()}
                  disabled={!ensName.trim() || logsLoading}
                >
                  {logsLoading ? (
                    <>
                      <div className="spinner" />
                      Loading Logs…
                    </>
                  ) : (
                    "Load Backend Logs"
                  )}
                </button>
              </div>

              <div className="divider" />

              <div className="flex items-center justify-between">
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    Daily Spend Today
                  </div>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Current total recorded by the backend
                  </div>
                </div>
                <div className="mono" style={{ color: "var(--neon-amber)" }}>
                  {dailySpent ?? "—"}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h2>Backend Verification Logs</h2>
                <p>Recent transaction and verification records for this ENS</p>
              </div>

              {!ensName.trim() ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.84rem",
                    padding: "12px 0",
                  }}
                >
                  Enter an ENS name to load logs.
                </div>
              ) : logsLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "var(--text-muted)",
                    fontSize: "0.84rem",
                  }}
                >
                  <div className="spinner" />
                  Loading backend logs…
                </div>
              ) : !logs.length ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.84rem",
                    padding: "12px 0",
                  }}
                >
                  No backend logs found for this ENS name yet.
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {logs.slice(0, 8).map((log) => (
                    <LogRow
                      key={
                        log._id ||
                        `${log.createdAt}-${log.amount}-${log.status}`
                      }
                      log={log}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="card" style={{ minHeight: 400 }}>
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <h2>Constraint Checks</h2>
                  {result ? (
                    <span
                      className={`badge ${
                        isPassed ? "badge-green" : "badge-red"
                      }`}
                    >
                      {isPassed ? "✓ ALLOWED" : "✗ BLOCKED"}
                    </span>
                  ) : null}
                </div>
              </div>

              {!result && !loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "60px 0",
                    color: "var(--text-muted)",
                  }}
                >
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔍</div>
                  <p>Enter real request values and run the live verifier</p>
                </div>
              ) : null}

              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div
                    className="spinner"
                    style={{
                      width: 36,
                      height: 36,
                      borderWidth: 3,
                      margin: "0 auto 16px",
                    }}
                  />
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.875rem",
                    }}
                  >
                    Fetching ENS → IPFS → checking policy constraints…
                  </p>
                </div>
              ) : null}

              {result ? (
                <>
                  <div
                    className={`alert ${
                      isPassed ? "alert-success" : "alert-error"
                    }`}
                    style={{ marginBottom: 20 }}
                  >
                    {isPassed
                      ? "✅ All policy constraints passed"
                      : `❌ ${result.result.reason}`}
                  </div>

                  <div>
                    {checks.map((c) => (
                      <CheckRow
                        key={c.key}
                        label={c.label}
                        status={c.status}
                        detail={c.detail}
                      />
                    ))}
                  </div>

                  <div className="divider" />

                  <div style={{ fontSize: "0.78rem" }}>
                    <div className="form-label" style={{ marginBottom: 8 }}>
                      Verification Payload
                    </div>
                    <pre
                      className="code-block"
                      style={{
                        fontSize: "0.75rem",
                        padding: "10px 14px",
                        maxHeight: 260,
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
