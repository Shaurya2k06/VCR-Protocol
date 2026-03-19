import { useEffect, useMemo, useState } from "react";
import { vcr } from "../../lib/api";
function parseJsonHeader(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "0.84rem",
          textAlign: "right",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function StepRow({ index, label, state, detail }) {
  const color =
    state === "success"
      ? "var(--neon-green)"
      : state === "error"
        ? "var(--neon-red)"
        : state === "active"
          ? "var(--neon-blue)"
          : "var(--text-muted)";

  const bg =
    state === "success"
      ? "rgba(74,222,128,0.12)"
      : state === "error"
        ? "rgba(248,113,113,0.12)"
        : state === "active"
          ? "rgba(99,210,255,0.12)"
          : "transparent";

  const border =
    state === "success"
      ? "rgba(74,222,128,0.25)"
      : state === "error"
        ? "rgba(248,113,113,0.25)"
        : state === "active"
          ? "rgba(99,210,255,0.25)"
          : "var(--border)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${border}`,
        background: bg,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "0.8rem",
          fontWeight: 700,
          color,
          border: `1px solid ${border}`,
        }}
      >
        {state === "success" ? "✓" : state === "error" ? "✗" : index + 1}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "0.86rem",
            fontWeight: 600,
            fontFamily: "var(--font-display)",
            color,
          }}
        >
          {label}
        </div>
        {detail ? (
          <div
            style={{
              marginTop: 4,
              fontSize: "0.76rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
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

export default function PaywallDemo() {
  const [ensName, setEnsName] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [chain, setChain] = useState("");
  const [recipient, setRecipient] = useState("");

  const [configLoading, setConfigLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [paywallLoading, setPaywallLoading] = useState(false);
  const [settling, setSettling] = useState(false);

  const [error, setError] = useState("");
  const [paywallStatus, setPaywallStatus] = useState(null);
  const [requirement, setRequirement] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [contentResult, setContentResult] = useState(null);
  const [settleResult, setSettleResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [suiteLoading, setSuiteLoading] = useState(false);
  const [suiteCommitSuccess, setSuiteCommitSuccess] = useState(false);
  const [suiteResult, setSuiteResult] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      setConfigLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "https://vcr-protocol-ylgy.onrender.com"}/api/demo/config`,
        );
        const data = await res.json();

        if (!mounted) return;

        setAmount(data.amount || "100000");
        setToken(data.token || "USDC");
        setChain(data.network || "base-sepolia");
        setRecipient(data.recipient || "");
      } catch {
        if (!mounted) return;
        setAmount("100000");
        setToken("USDC");
        setChain("base-sepolia");
        setRecipient("");
      } finally {
        if (mounted) setConfigLoading(false);
      }
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  const steps = useMemo(() => {
    const has402 = paywallStatus?.status === 402;
    const checkAllowed = checkResult?.result?.allowed === true;
    const checkRejected = checkResult?.result?.allowed === false;
    const gotContent = !!contentResult?.success;
    const settled = !!settleResult?.success;

    return [
      {
        label: "Request paywall endpoint",
        state: paywallLoading
          ? "active"
          : has402 || gotContent
            ? "success"
            : "idle",
        detail: has402
          ? "Backend returned a live PAYMENT-REQUIRED response."
          : gotContent
            ? "Backend returned protected content."
            : "Call the real backend paywall endpoint.",
      },
      {
        label: "Read PAYMENT-REQUIRED header",
        state: requirement ? "success" : has402 ? "active" : "idle",
        detail: requirement
          ? `${requirement.price} ${requirement.token} on ${requirement.network}`
          : "Extract live payment requirements from the backend response.",
      },
      {
        label: "Run live VCR verification",
        state: checking
          ? "active"
          : checkAllowed
            ? "success"
            : checkRejected
              ? "error"
              : "idle",
        detail:
          checkResult?.result?.reason ||
          "Backend checks ENS → IPFS policy → daily spend.",
      },
      {
        label: "Attempt protected content access",
        state: gotContent
          ? "success"
          : paywallStatus?.status && paywallStatus.status !== 402
            ? "active"
            : "idle",
        detail: gotContent
          ? "Protected content returned from backend."
          : "Retry paywall route once payment flow is available.",
      },
      {
        label: "Persist settlement / spend",
        state: settling ? "active" : settled ? "success" : "idle",
        detail: settled
          ? `Daily spent is now ${settleResult.dailySpent}`
          : "Record successful spend against backend state.",
      },
    ];
  }, [
    paywallLoading,
    paywallStatus,
    requirement,
    checking,
    checkResult,
    contentResult,
    settling,
    settleResult,
  ]);

  const loadLogs = async (currentEnsName) => {
    if (!currentEnsName) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "https://vcr-protocol-ylgy.onrender.com"}/api/demo/logs/${encodeURIComponent(currentEnsName)}`,
      );
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setLogs([]);
    }
  };

  const requestPaywall = async () => {
    setError("");
    setPaywallLoading(true);
    setContentResult(null);

    try {
      const res = await vcr.getPaymentRequired(
        ensName
          ? {
              "x-agent-ens": ensName,
            }
          : {},
      );

      setPaywallStatus(res);
      const parsedRequirement = parseJsonHeader(res.paymentRequired);
      setRequirement(parsedRequirement);

      if (res.ok && res.body?.success) {
        setContentResult(res.body);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setPaywallLoading(false);
    }
  };

  const runCheck = async () => {
    setError("");
    setChecking(true);
    setCheckResult(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "https://vcr-protocol-ylgy.onrender.com"}/api/demo/check`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ensName,
            amount,
            token,
            recipient,
            chain,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setCheckResult(data);
      await loadLogs(ensName);
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const recordSettlement = async () => {
    setError("");
    setSettling(true);
    setSettleResult(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "https://vcr-protocol-ylgy.onrender.com"}/api/demo/settle`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ensName,
            amount,
            token,
            recipient,
            chain,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Settlement recording failed");
      }

      setSettleResult(data);
      await loadLogs(ensName);
    } catch (e) {
      setError(e.message);
    } finally {
      setSettling(false);
    }
  };

  const canRunActions =
    ensName.trim() &&
    amount.trim() &&
    token.trim() &&
    chain.trim() &&
    recipient.trim();

  const runProtocolSuite = async () => {
    if (!ensName.trim()) {
      setError("Enter an ENS name before running the protocol suite.");
      return;
    }

    setError("");
    setSuiteLoading(true);
    setSuiteResult(null);

    try {
      const result = await vcr.runProtocolSuite(ensName.trim(), {
        commitSuccess: suiteCommitSuccess,
      });
      setSuiteResult(result);
      await loadLogs(ensName.trim());
    } catch (suiteError) {
      setError(suiteError.message);
    } finally {
      setSuiteLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-red" style={{ marginBottom: 12, gap: 6 }}>
            <span className="status-dot amber" />
            Live Backend Workflow
          </div>
          <h1>Paywall Verification</h1>
          <p>
            This page uses the real backend paywall, real VCR verification, and
            real database-backed spend tracking. No simulated frontend flow.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div>
              <h2>Protocol test suite</h2>
              <p>
                Run an automated set of x402-style micropayment scenarios against the live ENS policy. One path should pass, several should fail, and each result is checked against the actual permissions on the agent.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runProtocolSuite}
              disabled={!ensName.trim() || suiteLoading}
            >
              {suiteLoading ? "Running suite..." : "Run suite"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label className="wizard-toggle-row" style={{ fontFamily: "var(--font-mono)" }}>
              <input
                type="checkbox"
                checked={suiteCommitSuccess}
                onChange={(event) => setSuiteCommitSuccess(event.target.checked)}
              />
              <span>Commit the allowed micropayment to the daily spend ledger</span>
            </label>
            <div className="code-block" style={{ padding: "10px 14px" }}>
              Target ENS: {ensName || "Enter an ENS name below"}
            </div>
          </div>

          {suiteResult ? (
            <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
              <div className="grid-3">
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Scenarios</h2></div>
                  <div style={{ fontSize: "2rem", fontFamily: "var(--font-mono)", color: "var(--neon-blue)", fontWeight: 700 }}>
                    {suiteResult.suite.scenarios.length}
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Passed</h2></div>
                  <div style={{ fontSize: "2rem", fontFamily: "var(--font-mono)", color: "var(--neon-green)", fontWeight: 700 }}>
                    {suiteResult.suite.scenarios.filter((scenario) => scenario.passed).length}
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><h2 style={{ fontSize: "0.95rem" }}>Current daily spend</h2></div>
                  <div style={{ fontSize: "1.3rem", fontFamily: "var(--font-mono)", color: "var(--neon-amber)", fontWeight: 700 }}>
                    {suiteResult.suite.currentDailySpent}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {suiteResult.suite.scenarios.map((scenario, index) => (
                  <div
                    key={scenario.id}
                    className="card"
                    style={{
                      marginBottom: 0,
                      background: scenario.passed
                        ? "linear-gradient(135deg, rgba(74,222,128,0.10), rgba(74,222,128,0.04))"
                        : "linear-gradient(135deg, rgba(248,113,113,0.12), rgba(248,113,113,0.04))",
                    }}
                  >
                    <div className="card-header" style={{ marginBottom: 14 }}>
                      <div>
                        <h2 style={{ fontSize: "1rem" }}>
                          {index + 1}. {scenario.label}
                        </h2>
                        <p>{scenario.description}</p>
                      </div>
                      <span className={`badge ${scenario.passed ? "badge-green" : "badge-red"}`}>
                        {scenario.actualAllowed ? "allowed" : "blocked"}
                      </span>
                    </div>

                    <div className="grid-2">
                      <div className="code-block" style={{ fontSize: "0.8rem" }}>
                        Request
                        {"\n"}
                        {JSON.stringify(scenario.request, null, 2)}
                      </div>
                      <div className="code-block" style={{ fontSize: "0.8rem" }}>
                        Expected: {scenario.expectedAllowed ? "allowed" : "blocked"}
                        {"\n"}
                        Actual: {scenario.actualAllowed ? "allowed" : "blocked"}
                        {"\n"}
                        Daily spent at check: {scenario.dailySpentAtCheck}
                        {"\n"}
                        Mode: {scenario.simulated ? "simulated edge case" : "live policy inputs"}
                        {"\n"}
                        Reason: {scenario.reason || "Policy allowed the request"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {suiteResult.committedResult ? (
                <div className="alert alert-success">
                  The allowed micropayment was recorded successfully. Daily spend is now {suiteResult.committedResult.dailySpent}.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid-2">
          <div>
            <div className="card">
              <div className="card-header">
                <h2>Live Request Setup</h2>
                <p>
                  Use actual backend configuration and your registered
                  ENS-linked agent.
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
                    disabled={configLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Token</label>
                  <input
                    className="form-input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={configLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Recipient</label>
                <input
                  className="form-input mono"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={configLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Network</label>
                <input
                  className="form-input"
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                  disabled={configLoading}
                />
              </div>

              {error ? (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              ) : null}

              <div className="flex gap-3 mt-4" style={{ flexWrap: "wrap" }}>
                <button
                  className="btn btn-outline"
                  onClick={requestPaywall}
                  disabled={!canRunActions || paywallLoading}
                >
                  {paywallLoading ? (
                    <>
                      <div className="spinner" />
                      Requesting…
                    </>
                  ) : (
                    "1. Hit Paywall"
                  )}
                </button>

                <button
                  className="btn btn-primary"
                  onClick={runCheck}
                  disabled={!canRunActions || checking}
                >
                  {checking ? (
                    <>
                      <div className="spinner" />
                      Verifying…
                    </>
                  ) : (
                    "2. Run Verification"
                  )}
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={recordSettlement}
                  disabled={
                    !canRunActions ||
                    settling ||
                    checkResult?.result?.allowed !== true
                  }
                >
                  {settling ? (
                    <>
                      <div className="spinner" />
                      Recording…
                    </>
                  ) : (
                    "3. Record Settlement"
                  )}
                </button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h2>Live Backend Results</h2>
                <p>What your backend is actually returning right now.</p>
              </div>

              <DetailRow
                label="Paywall HTTP Status"
                value={paywallStatus?.status}
              />
              <DetailRow
                label="Payment Requirement Header"
                value={paywallStatus?.paymentRequired ? "Present" : "Missing"}
              />
              <DetailRow
                label="Verification Allowed"
                value={
                  checkResult?.result
                    ? checkResult.result.allowed
                      ? "Yes"
                      : "No"
                    : "—"
                }
              />
              <DetailRow
                label="Settlement Recorded"
                value={settleResult?.success ? "Yes" : "No"}
              />
              <DetailRow
                label="Daily Spend Total"
                value={
                  settleResult?.dailySpent || contentResult?.daily?.amountSpent
                }
                mono
              />
            </div>

            {requirement ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h2>PAYMENT-REQUIRED</h2>
                  <p>Live header returned by your backend paywall route.</p>
                </div>
                <pre
                  className="code-block"
                  style={{ maxHeight: 260, overflow: "auto" }}
                >
                  {JSON.stringify(requirement, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>

          <div>
            <div className="card" style={{ minHeight: 420 }}>
              <div className="card-header">
                <h2>Workflow State</h2>
                <p>Track the real backend workflow end to end.</p>
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {steps.map((step, index) => (
                  <StepRow
                    key={step.label}
                    index={index}
                    label={step.label}
                    state={step.state}
                    detail={step.detail}
                  />
                ))}
              </div>

              {checkResult?.result?.reason ? (
                <>
                  <div className="divider" />
                  <div
                    className={`alert ${
                      checkResult.result.allowed
                        ? "alert-success"
                        : "alert-error"
                    }`}
                  >
                    {checkResult.result.allowed
                      ? "Verification passed against the live backend."
                      : checkResult.result.reason}
                  </div>
                </>
              ) : null}
            </div>

            {contentResult ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h2>Protected Content Response</h2>
                  <p>
                    Actual content payload returned from the backend paywall
                    route.
                  </p>
                </div>
                <pre
                  className="code-block"
                  style={{ maxHeight: 260, overflow: "auto" }}
                >
                  {JSON.stringify(contentResult, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h2>Recent Transaction Logs</h2>
                <p>Latest records stored by the backend for this ENS name.</p>
              </div>

              {!logs.length ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.84rem",
                    padding: "12px 0",
                  }}
                >
                  No logs loaded yet.
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {logs.slice(0, 6).map((log) => (
                    <div
                      key={log._id || `${log.createdAt}-${log.amount}`}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px",
                        background: "var(--bg-card)",
                      }}
                    >
                      <div
                        className="flex items-center justify-between"
                        style={{ gap: 12 }}
                      >
                        <div
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          {log.type}
                        </div>
                        <span
                          className={`badge ${
                            log.status === "completed"
                              ? "badge-green"
                              : log.status === "rejected"
                                ? "badge-red"
                                : "badge-gray"
                          }`}
                        >
                          {log.status}
                        </span>
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
                          Amount: <span className="mono">{log.amount}</span>{" "}
                          {log.token}
                        </div>
                        <div>
                          Recipient:{" "}
                          <span className="mono">{log.recipient}</span>
                        </div>
                        <div>
                          Chain: <span className="mono">{log.chain}</span>
                        </div>
                        <div>
                          Time:{" "}
                          <span className="mono">
                            {log.createdAt
                              ? new Date(log.createdAt).toLocaleString()
                              : "—"}
                          </span>
                        </div>
                        {log.vcrReason ? (
                          <div>Reason: {log.vcrReason}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
