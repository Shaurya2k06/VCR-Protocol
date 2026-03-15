import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { vcr } from "../../lib/api";

const FEATURED_AGENT = {
  ensName: "hoodi-small-002.vcrtcorp.eth",
  source: "hardcoded-hoodi-agent",
  network: "hoodi",
  token: "hteth",
};

function formatTokenAmount(amount, token) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return amount;
  }

  const normalizedToken = (token ?? "").toLowerCase();
  const isEthLike = normalizedToken.includes("eth");
  const divisor = isEthLike ? 1e18 : 1e6;
  const symbol = token?.toUpperCase() || "TOKEN";
  const value = numeric / divisor;

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} ${symbol}`;
}

function minBigInt(values) {
  return values.reduce((smallest, value) => (value < smallest ? value : smallest));
}

function maxBigInt(values) {
  return values.reduce((largest, value) => (value > largest ? value : largest));
}

function choosePreferredAmount(token) {
  const normalizedToken = (token ?? "").toLowerCase();
  if (normalizedToken.includes("eth")) {
    return 1_000_000_000_000_000n;
  }

  return 100_000n;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildDemoPolicy(policy) {
  if (!policy) {
    return null;
  }

  return {
    ...policy,
    constraints: {
      ...policy.constraints,
      timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
    },
  };
}

function evaluateRequest(policy, request, dailySpent) {
  const amount = BigInt(request.amount);
  const maxTransaction = BigInt(policy.constraints.maxTransaction.amount);
  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);
  const currentSpent = BigInt(dailySpent);

  if (amount > maxTransaction) {
    return {
      allowed: false,
      reason: `Exceeds max transaction (${request.amount} > ${maxTransaction.toString()})`,
    };
  }

  if (
    !policy.constraints.allowedRecipients
      .map((recipient) => recipient.toLowerCase())
      .includes(request.recipient.toLowerCase())
  ) {
    return {
      allowed: false,
      reason: `Recipient ${request.recipient} is not in the whitelist`,
    };
  }

  if (!policy.constraints.allowedTokens.includes(request.token)) {
    return {
      allowed: false,
      reason: `Token ${request.token} is not allowed. Allowed: ${policy.constraints.allowedTokens.join(", ")}`,
    };
  }

  if (!policy.constraints.allowedChains.includes(request.chain)) {
    return {
      allowed: false,
      reason: `Chain ${request.chain} is not allowed. Allowed: ${policy.constraints.allowedChains.join(", ")}`,
    };
  }

  if (currentSpent + amount > dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit exceeded (would spend ${(currentSpent + amount).toString()}, limit is ${dailyLimit.toString()})`,
    };
  }

  return {
    allowed: true,
    reason: undefined,
  };
}

function buildScenarios(policy, dailySpent) {
  if (!policy) {
    return [];
  }

  const maxTransaction = BigInt(policy.constraints.maxTransaction.amount);
  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);
  const currentSpent = BigInt(dailySpent);
  const remaining = dailyLimit > currentSpent ? dailyLimit - currentSpent : 0n;
  const primaryRecipient = policy.constraints.allowedRecipients[0];
  const secondaryRecipient = policy.constraints.allowedRecipients[1] ?? primaryRecipient;
  const token = policy.constraints.allowedTokens[0] ?? FEATURED_AGENT.token;
  const chain = policy.constraints.allowedChains[0] ?? FEATURED_AGENT.network;

  if (!primaryRecipient || remaining <= 0n) {
    return [];
  }

  const preferredAmount = choosePreferredAmount(token);
  const firstAllowedAmount = minBigInt([preferredAmount, maxTransaction, remaining]);
  const secondAllowedAmount = minBigInt([firstAllowedAmount, maxTransaction, remaining]);

  const spentAfterTwo = currentSpent + firstAllowedAmount + secondAllowedAmount;
  const remainingAfterTwo = dailyLimit > spentAfterTwo ? dailyLimit - spentAfterTwo : 0n;
  const dailyBlockAmount =
    remainingAfterTwo < maxTransaction
      ? remainingAfterTwo + 1n
      : minBigInt([maxTransaction, firstAllowedAmount > 0n ? firstAllowedAmount : maxTransaction]);
  const simulatedDailySpentAtCheck =
    remainingAfterTwo < maxTransaction
      ? spentAfterTwo
      : maxBigInt([0n, dailyLimit - dailyBlockAmount + 1n]);

  const scenarios = [
    {
      id: "allowed-micropayment",
      label: "Allowed micropayment",
      description: "Uses an allowed recipient, token, chain, and a small amount within the live policy bounds.",
      expectedAllowed: true,
      request: {
        amount: firstAllowedAmount.toString(),
        token,
        recipient: primaryRecipient,
        chain,
      },
      dailySpentAtCheck: dailySpent,
    },
    {
      id: "allowed-second-recipient",
      label: "Allowed second recipient",
      description: "A second send to another whitelisted recipient also clears the same live policy checks.",
      expectedAllowed: true,
      request: {
        amount: secondAllowedAmount.toString(),
        token,
        recipient: secondaryRecipient,
        chain,
      },
      dailySpentAtCheck: dailySpent,
    },
    {
      id: "blocked-recipient",
      label: "Blocked recipient",
      description: "Uses an address that is not in the live policy whitelist.",
      expectedAllowed: false,
      request: {
        amount: firstAllowedAmount.toString(),
        token,
        recipient: "0x000000000000000000000000000000000000dEaD",
        chain,
      },
      dailySpentAtCheck: dailySpent,
    },
    {
      id: "blocked-over-limit",
      label: "Blocked over-limit amount",
      description: "Uses a larger transfer amount that exceeds the policy max transaction threshold.",
      expectedAllowed: false,
      request: {
        amount: maxBigInt([maxTransaction + 1n, firstAllowedAmount * 9n]).toString(),
        token,
        recipient: primaryRecipient,
        chain,
      },
      dailySpentAtCheck: dailySpent,
    },
    {
      id: "blocked-daily-limit",
      label: "Blocked daily limit",
      description: "Evaluates after prior successful sends; request is denied because cumulative spend would exceed the daily limit.",
      expectedAllowed: false,
      request: {
        amount: dailyBlockAmount.toString(),
        token,
        recipient: primaryRecipient,
        chain,
      },
      dailySpentAtCheck: simulatedDailySpentAtCheck.toString(),
    },
  ];

  return scenarios.map((scenario) => {
    const result = evaluateRequest(policy, scenario.request, scenario.dailySpentAtCheck);
    return {
      ...scenario,
      actualAllowed: result.allowed,
      reason: result.reason,
      passed: result.allowed === scenario.expectedAllowed,
    };
  });
}

function ScenarioRow({ scenario, index, execution }) {
  const statusLabel = scenario.actualAllowed ? "ALLOWED" : "BLOCKED";
  const executionLabel = execution?.execution
    ? execution.execution.replaceAll("_", " ").toUpperCase()
    : "PENDING";

  return (
    <div className="wizard-review-item" style={{ alignItems: "start", display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, width: "100%", flexWrap: "wrap" }}>
        <strong>{index + 1}. {scenario.label}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`badge ${scenario.actualAllowed ? "badge-green" : "badge-red"}`}>{statusLabel}</span>
          <span className="badge badge-gray">{executionLabel}</span>
        </div>
      </div>
      <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>{scenario.description}</div>
      <div className="mono" style={{ fontSize: "0.78rem", opacity: 0.9 }}>
        req: {scenario.request.amount} {scenario.request.token} | {scenario.request.chain} | {scenario.request.recipient}
      </div>
      <div style={{ fontSize: "0.82rem", opacity: 0.85 }}>
        {execution?.reason || scenario.reason || "Trade can proceed to settlement"}
      </div>
    </div>
  );
}

export default function Demos() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(true);
  const [executeOnChain, setExecuteOnChain] = useState(true);
  const [error, setError] = useState("");
  const [policyUri, setPolicyUri] = useState("");
  const [livePolicy, setLivePolicy] = useState(null);
  const [dailySpent, setDailySpent] = useState("0");
  const [committed, setCommitted] = useState([]);
  const [suiteRun, setSuiteRun] = useState(null);
  const [liveLog, setLiveLog] = useState([]);
  const [runStartedAt, setRunStartedAt] = useState("");
  const [runEndedAt, setRunEndedAt] = useState("");
  const [currentTestName, setCurrentTestName] = useState("Idle");
  const runLogPollRef = useRef(null);
  const seenLogKeysRef = useRef(new Set());

  useEffect(() => {
    let active = true;

    async function loadDemoContext() {
      setLoading(true);
      try {
        const [policyResponse, dailyResponse] = await Promise.all([
          vcr.getPolicy(FEATURED_AGENT.ensName),
          vcr.getDemoDaily(FEATURED_AGENT.ensName, FEATURED_AGENT.token).catch(() => ({
            dailySpent: "0",
          })),
        ]);

        if (!active) {
          return;
        }

        setLivePolicy(policyResponse.policy);
        setPolicyUri(policyResponse.policyUri);
        setDailySpent(dailyResponse.dailySpent ?? "0");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError.message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDemoContext();

    return () => {
      active = false;
    };
  }, []);

  const demoPolicy = useMemo(() => buildDemoPolicy(livePolicy), [livePolicy]);
  const scenarios = useMemo(() => buildScenarios(demoPolicy, dailySpent), [demoPolicy, dailySpent]);
  const displayScenarios = suiteRun?.suite?.scenarios ?? scenarios;

  const summary = useMemo(() => ({
    total: displayScenarios.length,
    allowed: displayScenarios.filter((scenario) => scenario.actualAllowed).length,
    blocked: displayScenarios.filter((scenario) => !scenario.actualAllowed).length,
  }), [displayScenarios]);

  const executionByScenarioId = useMemo(() => {
    const rows = suiteRun?.scenarioExecutionResults ?? [];
    return new Map(rows.map((row) => [row.scenarioId, row]));
  }, [suiteRun]);

  const runVerdicts = useMemo(() => {
    const rows = displayScenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      allowed: Boolean(scenario.actualAllowed),
      reason: scenario.reason,
      execution: executionByScenarioId.get(scenario.id)?.execution,
    }));

    return {
      approved: rows.filter((row) => row.allowed),
      rejected: rows.filter((row) => !row.allowed),
    };
  }, [displayScenarios, executionByScenarioId]);

  const clearRunLogPoll = () => {
    if (runLogPollRef.current) {
      clearInterval(runLogPollRef.current);
      runLogPollRef.current = null;
    }
  };

  const getLogKey = (entry) =>
    entry?._id
    ?? `${entry?.createdAt ?? ""}-${entry?.type ?? ""}-${entry?.amount ?? ""}-${entry?.recipient ?? ""}-${entry?.status ?? ""}`;

  const toRuntimeMessage = (entry) => {
    if (!entry) return "Unknown runtime event";

    if (entry.type === "bitgo_send") {
      return `bitgo_send ${entry.status}: ${entry.txHash ? `tx=${entry.txHash}` : "awaiting tx hash"}`;
    }

    if (entry.type === "policy_violation") {
      return `policy_violation rejected: ${entry.vcrReason ?? "blocked by policy"}`;
    }

    if (entry.type === "x402_payment") {
      const verdict = entry.vcrAllowed ? "approved" : "blocked";
      return `x402_payment ${entry.status} (${verdict}): amount=${entry.amount} ${entry.token}`;
    }

    return `${entry.type} ${entry.status}`;
  };

  const toCurrentTestLabel = (entry) => {
    if (!entry) return "Running: waiting for backend events...";

    if (entry.type === "bitgo_send") {
      return "Running: on-chain transfer (BitGo)";
    }

    if (entry.type === "policy_violation") {
      return "Running: blocked testcase (VCR rejection)";
    }

    if (entry.type === "x402_payment" && entry.status === "completed") {
      return "Running: allowed testcase settlement";
    }

    return `Running: ${entry.type}`;
  };

  const flushNewRuntimeEvents = (payload) => {
    const logs = Array.isArray(payload?.logs) ? payload.logs : [];
    const chronological = [...logs].reverse();

    for (const entry of chronological) {
      const key = getLogKey(entry);
      if (seenLogKeysRef.current.has(key)) {
        continue;
      }

      seenLogKeysRef.current.add(key);
      pushLiveLog(toRuntimeMessage(entry));
      setCurrentTestName(toCurrentTestLabel(entry));
    }
  };

  const pushLiveLog = (message) => {
    setLiveLog((current) => [
      ...current,
      {
        at: new Date().toISOString(),
        message,
      },
    ]);
  };

  const runDemo = async () => {
    if (!demoPolicy) {
      setError("The demo policy has not loaded yet.");
      return;
    }

    setRunning(true);
    setError("");
    setCommitted([]);
    setSuiteRun(null);
    setLiveLog([]);
    setRunEndedAt("");
    clearRunLogPoll();
    seenLogKeysRef.current = new Set();

    setCurrentTestName("Running: waiting for backend events...");

    const startedAt = new Date().toISOString();
    setRunStartedAt(startedAt);
    pushLiveLog(`Run started for ${FEATURED_AGENT.ensName}`);
    pushLiveLog("Submitting 5-scenario suite request to backend...");

    try {
      const baseline = await vcr.getDemoLogs(FEATURED_AGENT.ensName);
      const baselineLogs = Array.isArray(baseline?.logs) ? baseline.logs : [];
      for (const entry of baselineLogs) {
        seenLogKeysRef.current.add(getLogKey(entry));
      }
    } catch {
      pushLiveLog("Could not load baseline runtime log; continuing with live polling.");
    }

    runLogPollRef.current = setInterval(async () => {
      try {
        const latest = await vcr.getDemoLogs(FEATURED_AGENT.ensName);
        flushNewRuntimeEvents(latest);
      } catch {
        // Keep polling even if one cycle fails.
      }
    }, 1200);

    try {
      const result = await vcr.runProtocolSuite(FEATURED_AGENT.ensName, {
        commitSuccess,
        executeOnChain,
      });

      setSuiteRun(result);
      setCurrentTestName("Finalizing run report...");
      pushLiveLog("Suite response received.");
      pushLiveLog(`Summary: ${result.suite.scenarios.length} tests | ${result.suite.scenarios.filter((item) => item.actualAllowed).length} allowed | ${result.suite.scenarios.filter((item) => !item.actualAllowed).length} blocked`);

      const committedResults = result.committedResults
        ?? (result.committedResult ? [{ scenarioId: "allowed-micropayment", ...result.committedResult }] : []);

      if (committedResults.length > 0) {
        setCommitted(committedResults.map((entry) => ({
          id: entry.scenarioId,
          amount: entry.amount,
          dailySpent: entry.dailySpent,
        })));
        const latestDaily = committedResults[committedResults.length - 1]?.dailySpent;
        if (latestDaily) {
          setDailySpent(latestDaily);
        }
        pushLiveLog(`Ledger updated for ${committedResults.length} allowed testcase(s).`);
      } else if (commitSuccess) {
        const latestDaily = await vcr.getDemoDaily(FEATURED_AGENT.ensName, FEATURED_AGENT.token);
        setDailySpent(latestDaily.dailySpent ?? dailySpent);
      }

      const scenarioRows = result.scenarioExecutionResults ?? [];
      const scenarioLabelById = new Map((result.suite?.scenarios ?? []).map((scenario) => [scenario.id, scenario.label]));
      for (const row of scenarioRows) {
        const scenarioLabel = scenarioLabelById.get(row.scenarioId) ?? row.scenarioId;
        const verdict = row.actualAllowed ? "APPROVED" : "REJECTED";
        const label = row.execution?.replaceAll("_", " ").toUpperCase() ?? "UNKNOWN";
        const detail = row.txid ? `txid=${row.txid}` : row.reason ?? "";
        pushLiveLog(`[${verdict}] ${scenarioLabel}: ${label}${detail ? ` | ${detail}` : ""}`);
      }

      try {
        const latest = await vcr.getDemoLogs(FEATURED_AGENT.ensName);
        flushNewRuntimeEvents(latest);
      } catch {
        // Ignore one-shot refresh failures.
      }
    } catch (runError) {
      setError(runError.message);
      setCurrentTestName("Run failed");
      pushLiveLog(`Run failed: ${runError.message}`);
    } finally {
      clearRunLogPoll();
      setRunning(false);
      setRunEndedAt(new Date().toISOString());
      setCurrentTestName((current) => (current === "Run failed" ? current : "Completed"));
    }
  };

  useEffect(() => () => clearRunLogPoll(), []);

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-red" style={{ marginBottom: 14 }}>
            Live verification console
          </div>
          <h1>Demos</h1>
          <p style={{ maxWidth: 900 }}>
            Compact run monitor for one real agent and five policy testcases. You can watch the run log, settlement activity, and per-test execution status in one view.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 0.9fr)", gap: 18, alignItems: "start" }}>
          <div className="card" style={{ marginBottom: 0, display: "grid", gap: 16 }}>
            <div className="card-header">
              <h2>Run controls</h2>
              <p>Hoodi policy suite with deterministic 5-case coverage.</p>
            </div>

            {loading ? (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                Loading live ENS policy...
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="wizard-review-item">
                  <span>ENS name</span>
                  <strong className="mono">{FEATURED_AGENT.ensName}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Network</span>
                  <strong>{FEATURED_AGENT.network}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Token</span>
                  <strong>{FEATURED_AGENT.token.toUpperCase()}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Loaded from</span>
                  <strong className="mono">{FEATURED_AGENT.source}</strong>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={runDemo}
                disabled={loading || !demoPolicy || running}
              >
                {running ? "Running demo..." : "Run demo"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loading || running}
                onClick={async () => {
                  try {
                    const result = await vcr.resetDemoDaily(FEATURED_AGENT.ensName, FEATURED_AGENT.token);
                    setDailySpent(result.dailySpent ?? "0");
                    setCurrentTestName("Daily spend reset");
                    pushLiveLog(`Daily spend reset for ${FEATURED_AGENT.token}: ${result.dailySpent ?? "0"}`);
                  } catch (resetError) {
                    setError(resetError.message);
                    pushLiveLog(`Daily reset failed: ${resetError.message}`);
                  }
                }}
              >
                Reset daily spend
              </button>
              <Link to="/register" className="btn btn-ghost">
                Create another agent
              </Link>
            </div>

            <label className="wizard-toggle-row" style={{ marginTop: 18, fontFamily: "var(--font-mono)" }}>
              <input
                type="checkbox"
                checked={commitSuccess}
                onChange={(event) => setCommitSuccess(event.target.checked)}
              />
              <span>Record the two allowed micropayments to the spend ledger</span>
            </label>

            <label className="wizard-toggle-row" style={{ marginTop: 10, fontFamily: "var(--font-mono)" }}>
              <input
                type="checkbox"
                checked={executeOnChain}
                onChange={(event) => setExecuteOnChain(event.target.checked)}
              />
              <span>Run all 5 scenarios and execute real transfers only for VCR-allowed cases</span>
            </label>

            <label className="wizard-toggle-row" style={{ marginTop: 10, fontFamily: "var(--font-mono)" }}>
              <span>
                Time-of-day rules are normalized to `0–24 UTC` only for the showcase so the two passing cases stay visible.
              </span>
            </label>

            <div className="grid-3" style={{ margin: 0 }}>
              <div className="card" style={{ marginBottom: 0, padding: 14 }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</div>
                <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{summary.total}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: 14 }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>Allowed</div>
                <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--nb-ok)" }}>{summary.allowed}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: 14 }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>Blocked</div>
                <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--nb-error)" }}>{summary.blocked}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, display: "grid", gap: 12 }}>
            <div className="card-header">
              <h2>Live run log</h2>
              <p>Chronological events for each suite run.</p>
            </div>

            <div
              className="card"
              style={{
                marginBottom: 0,
                padding: 14,
                color: "#e2e8f0",
                border: "1px solid rgba(148,163,184,0.25)",
                background: running
                  ? "linear-gradient(135deg, rgba(37,99,235,0.16), rgba(14,165,233,0.12))"
                  : "linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.18))",
              }}
            >
              <div style={{ fontSize: "0.75rem", opacity: 0.78, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Current testcase
              </div>
              <div className="mono" style={{ fontSize: "1rem", fontWeight: 700, marginTop: 6 }}>
                {currentTestName}
              </div>
            </div>

            <div className="wizard-review-item">
              <span>Started</span>
              <strong className="mono">{formatTime(runStartedAt)}</strong>
            </div>
            <div className="wizard-review-item">
              <span>Ended</span>
              <strong className="mono">{running ? "running..." : formatTime(runEndedAt)}</strong>
            </div>

            <div
              className="code-block"
              style={{
                minHeight: 220,
                maxHeight: 320,
                overflow: "auto",
                fontSize: "0.78rem",
                lineHeight: 1.5,
                color: "#e2e8f0",
                background: "linear-gradient(180deg, rgba(2,6,23,0.92), rgba(2,6,23,0.80))",
              }}
            >
              {liveLog.length === 0
                ? "No run events yet. Click Run demo to start."
                : liveLog.map((entry, index) => `${index + 1}. [${formatTime(entry.at)}] ${entry.message}`).join("\n")}
            </div>

            {suiteRun ? (
              <div className="grid-2" style={{ gap: 10 }}>
                <div
                  className="card"
                  style={{
                    marginBottom: 0,
                    padding: 12,
                    border: "1px solid rgba(16,185,129,0.25)",
                    background: "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(34,197,94,0.08))",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", opacity: 0.78, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Approved this run ({runVerdicts.approved.length})
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {runVerdicts.approved.length > 0 ? runVerdicts.approved.map((item) => (
                      <div key={item.id} style={{ fontSize: "0.82rem", color: "#dcfce7" }}>
                        {item.label}
                      </div>
                    )) : (
                      <div style={{ fontSize: "0.82rem", opacity: 0.85 }}>None</div>
                    )}
                  </div>
                </div>

                <div
                  className="card"
                  style={{
                    marginBottom: 0,
                    padding: 12,
                    border: "1px solid rgba(239,68,68,0.25)",
                    background: "linear-gradient(135deg, rgba(239,68,68,0.14), rgba(251,146,60,0.08))",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", opacity: 0.78, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Rejected this run ({runVerdicts.rejected.length})
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {runVerdicts.rejected.length > 0 ? runVerdicts.rejected.map((item) => (
                      <div key={item.id} style={{ fontSize: "0.82rem", color: "#fee2e2" }}>
                        {item.label}
                      </div>
                    )) : (
                      <div style={{ fontSize: "0.82rem", opacity: 0.85 }}>None</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {committed.length > 0 ? (
              <div className="alert alert-success" style={{ marginTop: 0 }}>
                Recorded {committed.length} allowed micropayment{committed.length > 1 ? "s" : ""} to the spend ledger. Latest daily spend is {dailySpent}.
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="alert alert-error" style={{ marginTop: 24 }}>
            {error}
          </div>
        ) : null}

        {!loading && demoPolicy ? (
          <>
            <div className="card" style={{ marginTop: 20, marginBottom: 0 }}>
              <div className="card-header">
                <h2>Policy snapshot</h2>
                <p>Resolved live from ENS for this run.</p>
              </div>
              <div className="grid-2">
                <div className="code-block">
                  ENS: {FEATURED_AGENT.ensName}
                  {"\n"}
                  Policy URI: {policyUri}
                  {"\n"}
                  Current daily spent: {dailySpent}
                </div>
                <div className="code-block">
                  Allowed recipient: {demoPolicy.constraints.allowedRecipients[0]}
                  {"\n"}
                  Network: {demoPolicy.constraints.allowedChains[0] ?? FEATURED_AGENT.network}
                  {"\n"}
                  Token: {demoPolicy.constraints.allowedTokens[0] ?? FEATURED_AGENT.token}
                  {"\n"}
                  Max transaction: {formatTokenAmount(
                    demoPolicy.constraints.maxTransaction.amount,
                    demoPolicy.constraints.allowedTokens[0] ?? FEATURED_AGENT.token,
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-header">
                <h2>Latest testcase outcomes</h2>
                <p>Post-run status for each scenario from the most recent execution.</p>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {displayScenarios.map((scenario, index) => (
                  <ScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    index={index}
                    execution={executionByScenarioId.get(scenario.id)}
                  />
                ))}
              </div>
            </div>

            {(() => {
              const executionRows = suiteRun?.executionResults
                ?? (suiteRun?.executionResult ? [suiteRun.executionResult] : []);
              const scenarioExecutionRows = suiteRun?.scenarioExecutionResults ?? [];

              if (executionRows.length === 0 && scenarioExecutionRows.length === 0) {
                return null;
              }

              const hasSuccessfulTx = executionRows.some((row) => row.txid);

              return (
                <div
                  className={hasSuccessfulTx ? "alert alert-success" : "alert alert-info"}
                  style={{ marginTop: 16 }}
                >
                  <strong>On-chain execution proof:</strong>
                  <div style={{ marginTop: 8, display: "grid", gap: 12 }}>
                    {scenarioExecutionRows.length > 0 ? (
                      <div className="code-block" style={{ fontSize: "0.8rem" }}>
                        Scenario execution timeline
                        {"\n"}
                        {scenarioExecutionRows.map((row, index) => {
                          const status =
                            row.execution === "executed"
                              ? "EXECUTED"
                              : row.execution === "rejected_by_vcr"
                                ? "REJECTED_BY_VCR"
                                : row.execution === "execution_failed"
                                  ? "EXECUTION_FAILED"
                                  : "NOT_EXECUTED";

                          const detail = row.txid
                            ? `txid=${row.txid}`
                            : row.reason
                              ? row.reason
                              : "no additional details";

                          return `\n${index + 1}. ${row.scenarioId}: ${status} — ${detail}`;
                        })}
                      </div>
                    ) : null}

                    {executionRows.map((row, index) => (
                      <div key={`${row.scenarioId ?? "scenario"}-${index}`} style={{ display: "grid", gap: 6 }}>
                        <div>
                          <strong>{row.scenarioId ?? `allowed-${index + 1}`}</strong>
                        </div>

                        <div>
                          {row.txid
                            ? `Transfer sent successfully. txid: ${row.txid}`
                            : row.error
                              ? `Execution attempt failed: ${row.error}`
                              : "Execution attempted without txid (possibly pending approval)."}
                        </div>

                        {row.txUrl ? (
                          <div>
                            <a
                              href={row.txUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost"
                              style={{ display: "inline-flex" }}
                            >
                              Open transaction on Hoodi Etherscan
                            </a>
                          </div>
                        ) : null}

                        {row.pendingApproval ? (
                          <div>Pending approval: {row.pendingApproval}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
}
