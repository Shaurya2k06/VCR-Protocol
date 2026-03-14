import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { vcr } from "../../lib/api";

const DEMO_RECIPIENTS = [
  "0x1234567890123456789012345678901234567890",
  "0xAbCdEf1234567890aBCDef1234567890ABcDeF12",
];

const DEFAULT_FORM = {
  name: "",
  baseDomain: "",
  description: "",
  maxPerTxUsdc: "25",
  dailyLimitUsdc: "100",
  allowedTokens: "USDC",
  allowedChains: "base-sepolia",
  startHour: "",
  endHour: "",
};

function sanitizeHandle(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function splitCsv(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatMoney(value) {
  if (!value || Number.isNaN(Number(value))) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function parseRecipientInput(value) {
  return value
    .split(/[\n,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AgentRegistration() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [allowedRecipients, setAllowedRecipients] = useState([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [readiness, setReadiness] = useState({
    loading: true,
    ready: false,
    missing: [],
    sdkReferences: [],
    error: "",
  });

  useEffect(() => {
    let active = true;

    async function loadReadiness() {
      try {
        const response = await vcr.getRegistrationReadiness();
        if (!active) {
          return;
        }

        setReadiness({
          loading: false,
          ready: response.ready,
          missing: response.missing ?? [],
          sdkReferences: response.sdkReferences ?? [],
          error: "",
        });
      } catch (readinessError) {
        if (!active) {
          return;
        }

        setReadiness({
          loading: false,
          ready: false,
          missing: [],
          sdkReferences: [],
          error: readinessError.message,
        });
      }
    }

    loadReadiness();

    return () => {
      active = false;
    };
  }, []);

  const ensPreview =
    form.name && form.baseDomain ? `${form.name}.${form.baseDomain}` : "agent-name.base.eth";

  const hoursConfigured = form.startHour !== "" || form.endHour !== "";
  const hoursValid =
    !hoursConfigured ||
    (form.startHour !== "" &&
      form.endHour !== "" &&
      Number(form.startHour) >= 0 &&
      Number(form.startHour) <= 23 &&
      Number(form.endHour) > Number(form.startHour) &&
      Number(form.endHour) <= 24);

  const canSubmit =
    readiness.ready &&
    form.name &&
    form.baseDomain &&
    form.maxPerTxUsdc &&
    form.dailyLimitUsdc &&
    Number(form.maxPerTxUsdc) > 0 &&
    Number(form.dailyLimitUsdc) >= Number(form.maxPerTxUsdc) &&
    allowedRecipients.length > 0 &&
    hoursValid &&
    !loading;

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]:
        key === "name"
          ? sanitizeHandle(value)
          : key === "baseDomain"
            ? value.trim().toLowerCase()
            : value,
    }));
  };

  const commitRecipients = () => {
    const parsed = parseRecipientInput(recipientInput);
    if (!parsed.length) {
      return;
    }

    const invalid = parsed.find((entry) => !/^0x[a-fA-F0-9]{40}$/.test(entry));
    if (invalid) {
      setError(`Recipient address is invalid: ${invalid}`);
      return;
    }

    setAllowedRecipients((current) => [...new Set([...current, ...parsed])]);
    setRecipientInput("");
    setError("");
  };

  const removeRecipient = (recipient) => {
    setAllowedRecipients((current) => current.filter((entry) => entry !== recipient));
  };

  const fillDemo = () => {
    setForm({
      name: "researcher-001",
      baseDomain: "acmecorp.eth",
      description: "Research agent with a small supervised USDC budget.",
      maxPerTxUsdc: "25",
      dailyLimitUsdc: "100",
      allowedTokens: "USDC",
      allowedChains: "base-sepolia",
      startHour: "9",
      endHour: "17",
    });
    setAllowedRecipients(DEMO_RECIPIENTS);
    setShowAdvanced(true);
    setError("");
    setResult(null);
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setAllowedRecipients([]);
    setRecipientInput("");
    setShowAdvanced(false);
    setLoading(false);
    setError("");
    setResult(null);
  };

  const submit = async () => {
    setLoading(true);
    setError("");

    try {
      const payload = {
        name: form.name,
        baseDomain: form.baseDomain,
        description: form.description.trim() || undefined,
        maxPerTxUsdc: form.maxPerTxUsdc.trim(),
        dailyLimitUsdc: form.dailyLimitUsdc.trim(),
        allowedRecipients,
        allowedTokens: splitCsv(form.allowedTokens),
        allowedChains: splitCsv(form.allowedChains),
        ...(hoursConfigured
          ? {
              allowedHours: [
                Number(form.startHour),
                Number(form.endHour),
              ],
            }
          : {}),
      };

      const response = await vcr.registerAgent(payload);
      setResult(response);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const record = result?.record;
  const sdkReferences = result?.sdkReferences ?? readiness.sdkReferences;

  return (
    <div className="page register-shell">
      <div className="container">
        <div className="register-hero">
          <div>
            <div className="badge badge-blue" style={{ marginBottom: 16 }}>
              No-code agent launch
            </div>
            <h1>Launch a VCR agent in one flow.</h1>
            <p>
              This screen wraps the SDK&apos;s full lifecycle so you can create a
              BitGo wallet, register ERC-8004, publish the VCR policy, and bind
              ENSIP-25 without hand-writing JSON.
            </p>
          </div>

          <div className="register-status-card">
            <span className={`register-status-dot${readiness.ready ? " ready" : ""}`} />
            <div>
              <strong>
                {readiness.loading
                  ? "Checking backend setup..."
                  : readiness.ready
                    ? "Server is ready for SDK-backed registration"
                    : "Backend setup needs attention"}
              </strong>
              <p>
                {readiness.loading
                  ? "Verifying the server has the required SDK environment."
                  : readiness.error
                    ? readiness.error
                    : readiness.ready
                      ? "The frontend can call the local SDK flow directly through the API."
                      : "Missing environment variables will block createAgent()."}
              </p>
            </div>
          </div>
        </div>

        {!readiness.loading && !readiness.ready && readiness.missing.length > 0 && (
          <div className="alert alert-error">
            Missing environment: {readiness.missing.join(", ")}
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {!result && (
          <div className="register-layout">
            <div className="card register-form-card">
              <div className="register-card-header">
                <div>
                  <h2>CreateAgentConfig</h2>
                  <p>
                    These fields map directly to the SDK&apos;s
                    `createAgent(config, env)` flow.
                  </p>
                </div>
                <button className="btn btn-ghost" type="button" onClick={fillDemo}>
                  Use demo values
                </button>
              </div>

              <div className="field-grid">
                <div className="form-group">
                  <label className="form-label">Agent handle</label>
                  <input
                    className="form-input mono"
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="researcher-001"
                  />
                  <p className="field-help">
                    Lowercase letters, numbers, and hyphens only. This becomes the
                    ENS subname and local agent filename.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Base ENS domain</label>
                  <input
                    className="form-input mono"
                    value={form.baseDomain}
                    onChange={(event) => updateField("baseDomain", event.target.value)}
                    placeholder="acmecorp.eth"
                  />
                  <p className="field-help">
                    The owner wallet on the server must control this domain.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">What this agent does</label>
                <textarea
                  className="form-textarea"
                  rows="4"
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  placeholder="Research budget agent for paid API calls and retrieval."
                />
              </div>

              <div className="field-grid">
                <div className="form-group">
                  <label className="form-label">Max per payment (USDC)</label>
                  <input
                    className="form-input mono"
                    inputMode="decimal"
                    value={form.maxPerTxUsdc}
                    onChange={(event) => updateField("maxPerTxUsdc", event.target.value)}
                    placeholder="25"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Daily limit (USDC)</label>
                  <input
                    className="form-input mono"
                    inputMode="decimal"
                    value={form.dailyLimitUsdc}
                    onChange={(event) => updateField("dailyLimitUsdc", event.target.value)}
                    placeholder="100"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Allowed recipients</label>
                <div className="recipient-composer">
                  <textarea
                    className="form-textarea"
                    rows="3"
                    value={recipientInput}
                    onChange={(event) => setRecipientInput(event.target.value)}
                    placeholder="Paste one or more wallet addresses"
                  />
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={commitRecipients}
                  >
                    Add recipient
                  </button>
                </div>
                <p className="field-help">
                  Recipients are locked into the BitGo wallet policy after the
                  48-hour window, so add every destination you need up front.
                </p>

                <div className="chip-list">
                  {allowedRecipients.length === 0 ? (
                    <span className="empty-chip">No recipients added yet</span>
                  ) : (
                    allowedRecipients.map((recipient) => (
                      <button
                        key={recipient}
                        type="button"
                        className="recipient-chip"
                        onClick={() => removeRecipient(recipient)}
                      >
                        <span>{recipient}</span>
                        <span className="recipient-chip-x">remove</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <button
                type="button"
                className="register-toggle"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                {showAdvanced ? "Hide advanced policy options" : "Show advanced policy options"}
              </button>

              {showAdvanced && (
                <div className="advanced-grid">
                  <div className="form-group">
                    <label className="form-label">Allowed tokens</label>
                    <input
                      className="form-input mono"
                      value={form.allowedTokens}
                      onChange={(event) => updateField("allowedTokens", event.target.value)}
                      placeholder="USDC"
                    />
                    <p className="field-help">Comma-separated. `USDC` is the default.</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Allowed chains</label>
                    <input
                      className="form-input mono"
                      value={form.allowedChains}
                      onChange={(event) => updateField("allowedChains", event.target.value)}
                      placeholder="base-sepolia"
                    />
                    <p className="field-help">
                      Comma-separated chain names from the SDK policy.
                    </p>
                  </div>

                  <div className="field-grid">
                    <div className="form-group">
                      <label className="form-label">Allowed from hour (UTC)</label>
                      <input
                        className="form-input mono"
                        inputMode="numeric"
                        value={form.startHour}
                        onChange={(event) => updateField("startHour", event.target.value)}
                        placeholder="9"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Allowed until hour (UTC)</label>
                      <input
                        className="form-input mono"
                        inputMode="numeric"
                        value={form.endHour}
                        onChange={(event) => updateField("endHour", event.target.value)}
                        placeholder="17"
                      />
                    </div>
                  </div>

                  {!hoursValid && (
                    <div className="alert alert-error">
                      Allowed hours must be a valid UTC range like 9 to 17.
                    </div>
                  )}
                </div>
              )}

              <div className="register-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                >
                  {loading ? "Creating agent..." : "Create agent"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Reset
                </button>
              </div>
            </div>

            <div className="register-sidebar">
              <div className="card register-summary-card">
                <div className="card-header">
                  <h2>Launch summary</h2>
                  <p>What the SDK will create for this agent.</p>
                </div>

                <div className="summary-stack">
                  <div className="summary-row">
                    <span>ENS name</span>
                    <strong className="mono">{ensPreview}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Per payment</span>
                    <strong>{formatMoney(form.maxPerTxUsdc)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Daily budget</span>
                    <strong>{formatMoney(form.dailyLimitUsdc)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Recipients</span>
                    <strong>{allowedRecipients.length}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Default chain</span>
                    <strong className="mono">{splitCsv(form.allowedChains)[0] ?? "base-sepolia"}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Default token</span>
                    <strong className="mono">{splitCsv(form.allowedTokens)[0] ?? "USDC"}</strong>
                  </div>
                </div>
              </div>

              <div className="card register-summary-card">
                <div className="card-header">
                  <h2>SDK references</h2>
                  <p>The UI is intentionally wired to the local SDK, not duplicated logic.</p>
                </div>

                <div className="sdk-reference-list">
                  {sdkReferences.length === 0 ? (
                    <span className="empty-chip">SDK references load after readiness check</span>
                  ) : (
                    sdkReferences.map((reference) => (
                      <code key={reference} className="sdk-reference-pill">
                        {reference}
                      </code>
                    ))
                  )}
                </div>

                <div className="launch-steps">
                  <div className="launch-step">
                    <strong>1.</strong>
                    <span>Create BitGo wallet + policy hash</span>
                  </div>
                  <div className="launch-step">
                    <strong>2.</strong>
                    <span>Register ERC-8004 agent on Sepolia</span>
                  </div>
                  <div className="launch-step">
                    <strong>3.</strong>
                    <span>Store policy via Fileverse / IPFS</span>
                  </div>
                  <div className="launch-step">
                    <strong>4.</strong>
                    <span>Set ENSIP-25 and `vcr.policy` records</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {record && (
          <div className="card register-success-card">
            <div className="register-success-header">
              <div>
                <div className="badge" style={{ marginBottom: 16, background: "var(--nb-ok)", color: "var(--nb-ink)" }}>
                  Agent created
                </div>
                <h2>{record.ensName}</h2>
                <p>
                  The SDK completed wallet creation, ERC-8004 registration,
                  policy publishing, and ENS binding.
                </p>
              </div>

              <div className="success-actions">
                <a
                  href={`https://sepolia.etherscan.io/tx/${record.registrationTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  View registration tx
                </a>
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Create another
                </button>
              </div>
            </div>

            <div className="success-grid">
              <div className="success-item">
                <span>Agent ID</span>
                <strong>{record.agentId}</strong>
              </div>
              <div className="success-item">
                <span>BitGo wallet ID</span>
                <strong className="mono">{record.walletId}</strong>
              </div>
              <div className="success-item">
                <span>Wallet address</span>
                <strong className="mono">{record.walletAddress}</strong>
              </div>
              <div className="success-item">
                <span>Policy URI</span>
                <strong className="mono">{record.policyUri}</strong>
              </div>
              <div className="success-item">
                <span>Policy gateway</span>
                <strong className="mono">{record.policyGatewayUrl ?? "Not returned"}</strong>
              </div>
              <div className="success-item">
                <span>ENS tx</span>
                <strong className="mono">{record.ensTx}</strong>
              </div>
            </div>

            <div className="post-create-note">
              <p>
                The SDK also wrote local artifacts for this agent on the server
                under `server/agents/{form.name}.json` and, when available,
                `server/agents/{form.name}.key`.
              </p>
              <div className="register-actions">
                <Link to="/verify" className="btn btn-ghost">
                  Open verifier
                </Link>
                <Link to="/explorer" className="btn btn-ghost">
                  Open explorer
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
