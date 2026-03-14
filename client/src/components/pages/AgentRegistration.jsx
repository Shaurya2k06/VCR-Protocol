import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DdocEditor } from "@fileverse-dev/ddoc";
import { vcr } from "../../lib/api";
import { createStoredDocument } from "../../utils/api";
import { buildIpfsGatewayUrl, extractCidFromValue, uploadDocumentToIPFS } from "../../utils/ipfs";

const DEFAULT_TOKEN_OPTIONS = ["USDC", "USDT"];
const DEFAULT_CHAIN_OPTIONS = ["base-sepolia", "base"];
const DEFAULT_DOMAIN_OPTIONS = ["vcrtcorp.eth"];
const DEFAULT_DOMAIN_MODE_OPTIONS = [
  {
    id: "managed",
    label: "Managed by VCR",
    description: "One-click launch under the platform domain with backend-assisted ENS writes.",
  },
  {
    id: "self-owned",
    label: "Self-owned ENS",
    description: "Use your wallet and pay ENS gas yourself for a domain you already own or will register.",
  },
];
const DEMO_RECIPIENTS = [
  "0x1234567890123456789012345678901234567890",
  "0xAbCdEf1234567890aBCDef1234567890ABcDeF12",
];

const FLOW_STEPS = [
  { key: "handle", kicker: "Question 1", title: "What should this agent be called?" },
  { key: "domain", kicker: "Question 2", title: "Who should control its ENS identity?" },
  { key: "owner", kicker: "Question 3", title: "Which wallet is creating this agent?" },
  { key: "description", kicker: "Question 4", title: "What is this agent supposed to do?" },
  { key: "budget", kicker: "Question 5", title: "What budget should it get?" },
  { key: "recipients", kicker: "Question 6", title: "Which wallets can it pay?" },
  { key: "permissions", kicker: "Question 7", title: "What permissions should it have?" },
  { key: "review", kicker: "Final Review", title: "Review everything before launch" },
];

const JOB_STEP_LABELS = {
  wallet: "Create BitGo wallet",
  erc8004: "Register ERC-8004 identity",
  policy: "Publish policy and metadata",
  ens: "Bind ENS records",
  finalize: "Finalize and persist agent",
};

function sanitizeHandle(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function splitEntries(value) {
  return value
    .split(/[\n,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatMoney(value) {
  if (!value || Number.isNaN(Number(value))) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function labelForMulti(values) {
  if (!values.length) {
    return "Choose";
  }
  if (values.length === 1) {
    return values[0];
  }
  return `${values.length} selected`;
}

function isValidAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function shortenAddress(value) {
  if (!value) {
    return "Not connected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toRenderableDocumentUrl(value) {
  if (!value) {
    return "";
  }

  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice(7)}`;
  }

  return value;
}

function formatHoursWindow(allowedHours) {
  if (!Array.isArray(allowedHours) || allowedHours.length < 2) {
    return "No time restrictions";
  }

  return `${allowedHours[0]}:00 to ${allowedHours[1]}:00 UTC`;
}

function buildDefaultRulesDocumentSnapshot(payload) {
  const recipients = payload.allowedRecipients.length
    ? payload.allowedRecipients
    : ["None specified"];
  const tokens = payload.allowedTokens.length
    ? payload.allowedTokens
    : ["None specified"];
  const chains = payload.allowedChains.length
    ? payload.allowedChains
    : ["None specified"];

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: payload.title }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `ENS: ${payload.ensName}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Creator: ${payload.creatorAddress || "Not connected"}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Description: ${payload.description || "Not set"}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Max per payment (USDC): ${payload.maxPerTxUsdc}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Daily limit (USDC): ${payload.dailyLimitUsdc}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Allowed time window: ${formatHoursWindow(payload.allowedHours)}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Allowed tokens: ${tokens.join(", ")}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Allowed chains: ${chains.join(", ")}` }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Allowed recipients:" }],
      },
      ...recipients.map((recipient) => ({
        type: "paragraph",
        content: [{ type: "text", text: `• ${recipient}` }],
      })),
    ],
  };
}

function getWalletProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ethereum ?? null;
}

function DropdownMenu({
  label,
  open,
  onToggle,
  children,
}) {
  return (
    <div className={`wizard-dropdown${open ? " open" : ""}`}>
      <button type="button" className="wizard-dropdown-trigger" onClick={onToggle}>
        <span>{label}</span>
        <span className="wizard-dropdown-caret">{open ? "Close" : "Select"}</span>
      </button>
      {open && <div className="wizard-dropdown-panel">{children}</div>}
    </div>
  );
}

function StepPill({ index, step, active, complete }) {
  return (
    <div className={`wizard-step-pill${active ? " active" : ""}${complete ? " complete" : ""}`}>
      <span className="wizard-step-pill-index">{complete ? "Done" : index + 1}</span>
      <span>{step.title}</span>
    </div>
  );
}

export default function AgentRegistration() {
  const [currentStep, setCurrentStep] = useState(0);
  const [domainOptions, setDomainOptions] = useState(DEFAULT_DOMAIN_OPTIONS);
  const [tokenOptions, setTokenOptions] = useState(DEFAULT_TOKEN_OPTIONS);
  const [chainOptions, setChainOptions] = useState(DEFAULT_CHAIN_OPTIONS);
  const [domainModes, setDomainModes] = useState(DEFAULT_DOMAIN_MODE_OPTIONS);
  const [sdkReferences, setSdkReferences] = useState([]);
  const [ensAppUrl, setEnsAppUrl] = useState("https://app.ens.domains");
  const [signingAddress, setSigningAddress] = useState("");
  const [supportsSelfOwnedDomainAutomation, setSupportsSelfOwnedDomainAutomation] = useState(false);
  const [readiness, setReadiness] = useState({
    loading: true,
    ready: false,
    missing: [],
    error: "",
  });
  const [wallet, setWallet] = useState({
    address: "",
    status: "idle",
    error: "",
  });
  const [form, setForm] = useState({
    name: "",
    domainMode: "managed",
    selectedDomain: "vcrtcorp.eth",
    customDomain: "",
    description: "",
    maxPerTxUsdc: "25",
    dailyLimitUsdc: "100",
    allowedRecipients: [],
    allowedTokens: ["USDC"],
    allowedChains: ["base-sepolia"],
    timeRestricted: true,
    startHour: "9",
    endHour: "17",
  });
  const [recipientInput, setRecipientInput] = useState("");
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const [agentRecordFromDb, setAgentRecordFromDb] = useState(null);
  const [rulesDocTitle, setRulesDocTitle] = useState("");
  const [rulesDocTitleTouched, setRulesDocTitleTouched] = useState(false);
  const [rulesDocContent, setRulesDocContent] = useState(null);
  const [rulesDocTouched, setRulesDocTouched] = useState(false);
  const [rulesDocCid, setRulesDocCid] = useState("");
  const [rulesDocPublishing, setRulesDocPublishing] = useState(false);
  const [openDropdown, setOpenDropdown] = useState("");

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
          error: "",
        });
        setDomainOptions(response.suggestedDomains?.length ? response.suggestedDomains : DEFAULT_DOMAIN_OPTIONS);
        setTokenOptions(response.tokenOptions?.length ? response.tokenOptions : DEFAULT_TOKEN_OPTIONS);
        setChainOptions(response.chainOptions?.length ? response.chainOptions : DEFAULT_CHAIN_OPTIONS);
        setDomainModes(response.domainModes?.length ? response.domainModes : DEFAULT_DOMAIN_MODE_OPTIONS);
        setSdkReferences(response.sdkReferences ?? []);
        setEnsAppUrl(response.ensAppUrl ?? "https://app.ens.domains");
        setSigningAddress(response.signingAddress ?? "");
        setSupportsSelfOwnedDomainAutomation(Boolean(response.supportsSelfOwnedDomainAutomation));
        setForm((current) => ({
          ...current,
          selectedDomain: response.suggestedDomains?.[0] ?? current.selectedDomain,
        }));
      } catch (readinessError) {
        if (!active) {
          return;
        }

        setReadiness({
          loading: false,
          ready: false,
          missing: [],
          error: readinessError.message,
        });
      }
    }

    loadReadiness();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const provider = getWalletProvider();
    if (!provider) {
      return undefined;
    }

    let active = true;

    async function syncExistingWallet() {
      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (!active || !Array.isArray(accounts)) {
          return;
        }

        setWallet((current) => ({
          ...current,
          address: accounts[0] ?? "",
          status: accounts[0] ? "connected" : "idle",
          error: "",
        }));
      } catch (walletError) {
        if (!active) {
          return;
        }

        setWallet((current) => ({
          ...current,
          status: "error",
          error: walletError.message,
        }));
      }
    }

    function handleAccountsChanged(accounts) {
      if (!active) {
        return;
      }

      setWallet({
        address: accounts?.[0] ?? "",
        status: accounts?.[0] ? "connected" : "idle",
        error: "",
      });
    }

    syncExistingWallet();
    provider.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  useEffect(() => {
    if (!jobId || successResult) {
      return undefined;
    }

    let active = true;

    async function refreshJob() {
      try {
        const response = await vcr.getRegistrationJob(jobId);
        if (!active) {
          return;
        }

        setJob(response);
        if (response.status === "succeeded") {
          setSuccessResult(response.result);
        }
        if (response.status === "failed") {
          setError(response.error || "Agent creation failed");
        }
      } catch (jobError) {
        if (!active) {
          return;
        }

        setError(jobError.message);
      }
    }

    refreshJob();
    const timer = setInterval(refreshJob, 1500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, successResult]);

  useEffect(() => {
    if (!successResult?.record?.agentId) {
      setAgentRecordFromDb(null);
      return undefined;
    }

    let active = true;

    async function loadAgentFromDb() {
      try {
        const response = await vcr.getAgent(successResult.record.agentId);
        if (!active) {
          return;
        }

        setAgentRecordFromDb(response.localRecord ?? null);
      } catch {
        if (!active) {
          return;
        }

        setAgentRecordFromDb(null);
      }
    }

    loadAgentFromDb();

    return () => {
      active = false;
    };
  }, [successResult]);

  const effectiveDomain =
    form.domainMode === "managed"
      ? form.selectedDomain
      : form.customDomain.trim().toLowerCase();

  const ensPreview =
    form.name && effectiveDomain
      ? `${form.name}.${effectiveDomain}`
      : "agent-name.vcrtcorp.eth";

  const hoursValid =
    !form.timeRestricted ||
    (form.startHour !== "" &&
      form.endHour !== "" &&
      Number(form.startHour) >= 0 &&
      Number(form.startHour) <= 23 &&
      Number(form.endHour) > Number(form.startHour) &&
      Number(form.endHour) <= 24);

  const selfOwnedUnavailable = form.domainMode === "self-owned" && !supportsSelfOwnedDomainAutomation;
  const dbRulesDocumentUrl = agentRecordFromDb?.rulesDocumentUrl || "";
  const renderableRulesDocumentUrl = toRenderableDocumentUrl(dbRulesDocumentUrl);
  const rulesDocViewCid = rulesDocCid || extractCidFromValue(dbRulesDocumentUrl) || "";

  const reviewPayload = {
    name: form.name,
    baseDomain: effectiveDomain,
    description: form.description.trim() || undefined,
    maxPerTxUsdc: form.maxPerTxUsdc.trim(),
    dailyLimitUsdc: form.dailyLimitUsdc.trim(),
    allowedRecipients: form.allowedRecipients,
    allowedTokens: form.allowedTokens,
    allowedChains: form.allowedChains,
    creatorAddress: wallet.address,
    domainMode: form.domainMode,
    ...(form.timeRestricted
      ? {
          allowedHours: [Number(form.startHour), Number(form.endHour)],
        }
      : {}),
  };

  useEffect(() => {
    if (rulesDocTitleTouched || rulesDocTitle.trim()) {
      return;
    }

    setRulesDocTitle(`${ensPreview} rules document`);
  }, [ensPreview, rulesDocTitle, rulesDocTitleTouched]);

  useEffect(() => {
    if (rulesDocTouched) {
      return;
    }

    setRulesDocContent(
      buildDefaultRulesDocumentSnapshot({
        title: `${ensPreview} rules document`,
        ensName: ensPreview,
        creatorAddress: wallet.address,
        description: form.description.trim(),
        maxPerTxUsdc: form.maxPerTxUsdc.trim(),
        dailyLimitUsdc: form.dailyLimitUsdc.trim(),
        allowedRecipients: form.allowedRecipients,
        allowedTokens: form.allowedTokens,
        allowedChains: form.allowedChains,
        allowedHours: form.timeRestricted
          ? [Number(form.startHour), Number(form.endHour)]
          : undefined,
      }),
    );
  }, [
    ensPreview,
    form.allowedChains,
    form.allowedRecipients,
    form.allowedTokens,
    form.dailyLimitUsdc,
    form.description,
    form.maxPerTxUsdc,
    form.timeRestricted,
    form.startHour,
    form.endHour,
    rulesDocTouched,
    wallet.address,
  ]);

  const isStepValid = () => {
    const step = FLOW_STEPS[currentStep]?.key;

    if (step === "handle") {
      return Boolean(form.name);
    }
    if (step === "domain") {
      if (form.domainMode === "managed") {
        return Boolean(form.selectedDomain);
      }
      return Boolean(effectiveDomain) && effectiveDomain.includes(".");
    }
    if (step === "owner") {
      return Boolean(wallet.address);
    }
    if (step === "description") {
      return Boolean(form.description.trim());
    }
    if (step === "budget") {
      return (
        Boolean(form.maxPerTxUsdc) &&
        Boolean(form.dailyLimitUsdc) &&
        Number(form.maxPerTxUsdc) > 0 &&
        Number(form.dailyLimitUsdc) >= Number(form.maxPerTxUsdc)
      );
    }
    if (step === "recipients") {
      return form.allowedRecipients.length > 0;
    }
    if (step === "permissions") {
      return form.allowedTokens.length > 0 && form.allowedChains.length > 0 && hoursValid;
    }
    if (step === "review") {
      return (
        readiness.ready &&
        hoursValid &&
        Boolean(wallet.address) &&
        Boolean(rulesDocTitle.trim())
      );
    }

    return false;
  };

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]:
        field === "name"
          ? sanitizeHandle(value)
          : field === "customDomain"
            ? value.toLowerCase()
            : value,
    }));
  };

  const toggleMultiValue = (field, value) => {
    setForm((current) => {
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value)
          ? values.filter((entry) => entry !== value)
          : [...values, value],
      };
    });
  };

  const addRecipients = () => {
    const entries = splitEntries(recipientInput);
    if (!entries.length) {
      return;
    }

    const invalid = entries.find((entry) => !isValidAddress(entry));
    if (invalid) {
      setError(`Recipient address is invalid: ${invalid}`);
      return;
    }

    setForm((current) => ({
      ...current,
      allowedRecipients: [...new Set([...current.allowedRecipients, ...entries])],
    }));
    setRecipientInput("");
    setError("");
  };

  const removeRecipient = (recipient) => {
    setForm((current) => ({
      ...current,
      allowedRecipients: current.allowedRecipients.filter((entry) => entry !== recipient),
    }));
  };

  const connectWallet = async () => {
    const provider = getWalletProvider();
    if (!provider) {
      setWallet({
        address: "",
        status: "error",
        error: "Install a wallet like MetaMask to continue.",
      });
      return;
    }

    setWallet((current) => ({
      ...current,
      status: "connecting",
      error: "",
    }));

    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? (accounts[0] ?? "") : "";

      if (!address) {
        throw new Error("No wallet account was returned.");
      }

      setWallet({
        address,
        status: "connected",
        error: "",
      });
      setError("");
    } catch (walletError) {
      setWallet({
        address: "",
        status: "error",
        error: walletError.message,
      });
    }
  };

  const fillDemo = () => {
    setForm({
      name: "researcher-001",
      domainMode: "managed",
      selectedDomain: "vcrtcorp.eth",
      customDomain: "",
      description: "Research agent with a supervised spend policy for external services.",
      maxPerTxUsdc: "25",
      dailyLimitUsdc: "100",
      allowedRecipients: DEMO_RECIPIENTS,
      allowedTokens: ["USDC"],
      allowedChains: ["base-sepolia"],
      timeRestricted: true,
      startHour: "9",
      endHour: "17",
    });
    setCurrentStep(0);
    setError("");
    setSuccessResult(null);
    setAgentRecordFromDb(null);
    setRulesDocTitle("");
    setRulesDocTitleTouched(false);
    setRulesDocContent(null);
    setRulesDocTouched(false);
    setRulesDocCid("");
    setRulesDocPublishing(false);
    setJobId("");
    setJob(null);
  };

  const resetAll = () => {
    setForm({
      name: "",
      domainMode: "managed",
      selectedDomain: domainOptions[0] ?? "vcrtcorp.eth",
      customDomain: "",
      description: "",
      maxPerTxUsdc: "25",
      dailyLimitUsdc: "100",
      allowedRecipients: [],
      allowedTokens: ["USDC"],
      allowedChains: ["base-sepolia"],
      timeRestricted: true,
      startHour: "9",
      endHour: "17",
    });
    setRecipientInput("");
    setCurrentStep(0);
    setError("");
    setJobId("");
    setJob(null);
    setSuccessResult(null);
    setAgentRecordFromDb(null);
    setRulesDocTitle("");
    setRulesDocTitleTouched(false);
    setRulesDocContent(null);
    setRulesDocTouched(false);
    setRulesDocCid("");
    setRulesDocPublishing(false);
    setOpenDropdown("");
  };

  const submit = async () => {
    setError("");

    if (selfOwnedUnavailable) {
      setError("Self-owned ENS domains currently need to be completed from ENS App with your connected wallet.");
      return;
    }

    try {
      setRulesDocPublishing(true);

      const normalizedRulesDocTitle = rulesDocTitle.trim() || `${ensPreview} rules document`;
      const normalizedRulesDocContent =
        rulesDocContent ??
        buildDefaultRulesDocumentSnapshot({
          title: normalizedRulesDocTitle,
          ensName: ensPreview,
          creatorAddress: wallet.address,
          description: form.description.trim(),
          maxPerTxUsdc: form.maxPerTxUsdc.trim(),
          dailyLimitUsdc: form.dailyLimitUsdc.trim(),
          allowedRecipients: form.allowedRecipients,
          allowedTokens: form.allowedTokens,
          allowedChains: form.allowedChains,
          allowedHours: form.timeRestricted
            ? [Number(form.startHour), Number(form.endHour)]
            : undefined,
        });

      if (!normalizedRulesDocContent || typeof normalizedRulesDocContent !== "object") {
        throw new Error("Rules document is invalid. Please edit the document and try again.");
      }

      const cid = await uploadDocumentToIPFS(normalizedRulesDocContent);
      await createStoredDocument({
        title: normalizedRulesDocTitle,
        cid,
      });

      setRulesDocCid(cid);

      const rulesDocumentUrl = buildIpfsGatewayUrl(cid);

      const response = await vcr.startRegistrationJob({
        ...reviewPayload,
        rulesDocumentUrl,
        rulesDocumentRaw: JSON.stringify(normalizedRulesDocContent),
      });

      setJobId(response.jobId);
      setJob({
        status: response.status,
        steps: Object.entries(JOB_STEP_LABELS).map(([key, label]) => ({
          key,
          label,
          status: key === "wallet" ? "active" : "pending",
        })),
        logs: [],
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create agent");
    } finally {
      setRulesDocPublishing(false);
    }
  };

  const renderCurrentStep = () => {
    const step = FLOW_STEPS[currentStep]?.key;

    if (step === "handle") {
      return (
        <div className="wizard-question-card">
          <label className="wizard-label">Agent handle</label>
          <input
            className="wizard-input mono"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="researcher-001"
          />
          <p className="wizard-help">
            This becomes the ENS subname and the saved agent record name.
          </p>
        </div>
      );
    }

    if (step === "domain") {
      return (
        <div className="wizard-question-card">
          <label className="wizard-label">Registration path</label>
          <div className="wizard-mode-grid">
            {domainModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`wizard-mode-card${form.domainMode === mode.id ? " active" : ""}`}
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    domainMode: mode.id,
                    selectedDomain:
                      mode.id === "managed"
                        ? domainOptions[0] ?? current.selectedDomain
                        : current.selectedDomain,
                  }));
                  setError("");
                }}
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </button>
            ))}
          </div>

          {form.domainMode === "managed" ? (
            <>
              <label className="wizard-label wizard-section-label">Managed ENS domain</label>
              <DropdownMenu
                label={effectiveDomain || "Choose domain"}
                open={openDropdown === "domain"}
                onToggle={() => setOpenDropdown((current) => current === "domain" ? "" : "domain")}
              >
                {domainOptions.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    className={`wizard-option${form.selectedDomain === domain ? " active" : ""}`}
                    onClick={() => {
                      setForm((current) => ({ ...current, selectedDomain: domain }));
                      setOpenDropdown("");
                    }}
                  >
                    {domain}
                  </button>
                ))}
              </DropdownMenu>
              <p className="wizard-help">
                Managed mode is fully automated. The backend signer creates the subname and pays the Sepolia ENS write gas.
              </p>
            </>
          ) : (
            <div className="wizard-stack">
              <label className="wizard-label wizard-section-label">Your ENS domain</label>
              <input
                className="wizard-input mono"
                value={form.customDomain}
                onChange={(event) => updateField("customDomain", event.target.value)}
                placeholder="your-domain.eth"
              />
              <div className="alert alert-info">
                Self-owned mode records your wallet as the creator. ENS registration fees and ENS writes come from your connected wallet, not the backend.
              </div>
            </div>
          )}
        </div>
      );
    }

    if (step === "owner") {
      return (
        <div className="wizard-question-card">
          <div className="wizard-owner-card">
            <div>
              <label className="wizard-label">Creator wallet</label>
              <p className="wizard-help wizard-help-tight">
                Connect the wallet that should be recorded as the human creator of this agent.
              </p>
            </div>

            <button type="button" className="btn btn-primary" onClick={connectWallet}>
              {wallet.status === "connecting"
                ? "Connecting..."
                : wallet.address
                  ? "Reconnect wallet"
                  : "Connect wallet"}
            </button>
          </div>

          <div className="wizard-wallet-panel">
            <div className="wizard-wallet-row">
              <span>Connected wallet</span>
              <strong className="mono">{wallet.address || "No wallet connected"}</strong>
            </div>
            {signingAddress && (
              <div className="wizard-wallet-row">
                <span>Backend signer</span>
                <strong className="mono">{signingAddress}</strong>
              </div>
            )}
            <div className="wizard-wallet-row">
              <span>Fee responsibility</span>
              <strong>
                {form.domainMode === "managed"
                  ? "Backend pays Sepolia ENS write gas for managed subdomains."
                  : "Your connected wallet pays ENS registration and ENS write gas."}
              </strong>
            </div>
          </div>

          {wallet.error && <div className="alert alert-error">{wallet.error}</div>}
          {form.domainMode === "self-owned" ? (
            <div className="alert alert-warning">
              Use the wallet that owns this domain or the wallet you want to use to register it in ENS App.
            </div>
          ) : (
            <div className="alert alert-info">
              The backend signer completes the managed ENS write, but this wallet is still stored as the creator for auditability.
            </div>
          )}
        </div>
      );
    }

    if (step === "description") {
      return (
        <div className="wizard-question-card">
          <label className="wizard-label">Description</label>
          <textarea
            className="wizard-textarea"
            rows="5"
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Research budget agent for paid API calls, retrieval, and supervised experimentation."
          />
        </div>
      );
    }

    if (step === "budget") {
      return (
        <div className="wizard-question-card wizard-budget-grid">
          <div>
            <label className="wizard-label">Max per payment</label>
            <input
              className="wizard-input mono"
              inputMode="decimal"
              value={form.maxPerTxUsdc}
              onChange={(event) => updateField("maxPerTxUsdc", event.target.value)}
            />
            <p className="wizard-inline-value">{formatMoney(form.maxPerTxUsdc)}</p>
          </div>
          <div>
            <label className="wizard-label">Daily limit</label>
            <input
              className="wizard-input mono"
              inputMode="decimal"
              value={form.dailyLimitUsdc}
              onChange={(event) => updateField("dailyLimitUsdc", event.target.value)}
            />
            <p className="wizard-inline-value">{formatMoney(form.dailyLimitUsdc)}</p>
          </div>
          {Number(form.dailyLimitUsdc) < Number(form.maxPerTxUsdc) && (
            <div className="alert alert-error">
              Daily limit needs to be greater than or equal to the max payment amount.
            </div>
          )}
        </div>
      );
    }

    if (step === "recipients") {
      return (
        <div className="wizard-question-card">
          <label className="wizard-label">Allowed recipients</label>
          <div className="wizard-recipient-row">
            <textarea
              className="wizard-textarea"
              rows="4"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              placeholder="Paste one or more wallet addresses"
            />
            <button type="button" className="btn btn-primary" onClick={addRecipients}>
              Add
            </button>
          </div>
          <div className="wizard-chip-grid">
            {form.allowedRecipients.length === 0 ? (
              <span className="wizard-empty-state">No recipients added yet</span>
            ) : (
              form.allowedRecipients.map((recipient) => (
                <button
                  key={recipient}
                  type="button"
                  className="wizard-chip"
                  onClick={() => removeRecipient(recipient)}
                >
                  <span>{recipient}</span>
                  <span className="wizard-chip-action">Remove</span>
                </button>
              ))
            )}
          </div>
        </div>
      );
    }

    if (step === "permissions") {
      return (
        <div className="wizard-question-card">
          <div className="wizard-permission-grid">
            <div>
              <label className="wizard-label">Allowed tokens</label>
              <DropdownMenu
                label={labelForMulti(form.allowedTokens)}
                open={openDropdown === "tokens"}
                onToggle={() => setOpenDropdown((current) => current === "tokens" ? "" : "tokens")}
              >
                {tokenOptions.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className={`wizard-option${form.allowedTokens.includes(token) ? " active" : ""}`}
                    onClick={() => toggleMultiValue("allowedTokens", token)}
                  >
                    {token}
                  </button>
                ))}
              </DropdownMenu>
            </div>

            <div>
              <label className="wizard-label">Allowed chains</label>
              <DropdownMenu
                label={labelForMulti(form.allowedChains)}
                open={openDropdown === "chains"}
                onToggle={() => setOpenDropdown((current) => current === "chains" ? "" : "chains")}
              >
                {chainOptions.map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    className={`wizard-option${form.allowedChains.includes(chain) ? " active" : ""}`}
                    onClick={() => toggleMultiValue("allowedChains", chain)}
                  >
                    {chain}
                  </button>
                ))}
              </DropdownMenu>
            </div>
          </div>

          <div className="wizard-time-window">
            <label className="wizard-toggle-row">
              <input
                type="checkbox"
                checked={form.timeRestricted}
                onChange={(event) => updateField("timeRestricted", event.target.checked)}
              />
              <span>Restrict payments to a UTC time window</span>
            </label>

            {form.timeRestricted && (
              <div className="wizard-budget-grid">
                <div>
                  <label className="wizard-label">From hour (UTC)</label>
                  <input
                    className="wizard-input mono"
                    value={form.startHour}
                    onChange={(event) => updateField("startHour", event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="wizard-label">Until hour (UTC)</label>
                  <input
                    className="wizard-input mono"
                    value={form.endHour}
                    onChange={(event) => updateField("endHour", event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}

            {!hoursValid && (
              <div className="alert alert-error">
                Use a valid UTC window like 9 to 17.
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="wizard-review-card">
        <div className="wizard-review-grid">
          <div className="wizard-review-item">
            <span>ENS address</span>
            <strong className="mono">{ensPreview}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Domain mode</span>
            <strong>{form.domainMode === "managed" ? "Managed by VCR" : "Self-owned ENS"}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Creator wallet</span>
            <strong className="mono">{wallet.address}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Backend signer</span>
            <strong className="mono">{signingAddress || "Configured on server"}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Description</span>
            <strong>{form.description}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Max per payment</span>
            <strong>{formatMoney(form.maxPerTxUsdc)}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Daily limit</span>
            <strong>{formatMoney(form.dailyLimitUsdc)}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Fee responsibility</span>
            <strong>
              {form.domainMode === "managed"
                ? "Backend signer pays Sepolia ENS write gas."
                : "Connected wallet pays ENS registration and ENS write gas."}
            </strong>
          </div>
          <div className="wizard-review-item">
            <span>Allowed tokens</span>
            <strong className="mono">{form.allowedTokens.join(", ")}</strong>
          </div>
          <div className="wizard-review-item">
            <span>Allowed chains</span>
            <strong className="mono">{form.allowedChains.join(", ")}</strong>
          </div>
          <div className="wizard-review-item wide">
            <span>Allowed recipients</span>
            <div className="wizard-review-tags">
              {form.allowedRecipients.map((recipient) => (
                <code key={recipient} className="wizard-review-tag">
                  {recipient}
                </code>
              ))}
            </div>
          </div>
          <div className="wizard-review-item wide">
            <span>Hours</span>
            <strong className="mono">
              {form.timeRestricted
                ? `${form.startHour}:00 to ${form.endHour}:00 UTC`
                : "No time restriction"}
            </strong>
          </div>
          <div className="wizard-review-item wide">
            <span>Rules document (Fileverse dDoc)</span>
            <label className="wizard-label" style={{ marginBottom: 6 }}>Document title</label>
            <input
              className="wizard-input mono"
              value={rulesDocTitle}
              onChange={(event) => {
                setRulesDocTitleTouched(true);
                setRulesDocTitle(event.target.value);
              }}
              placeholder={`${ensPreview} rules document`}
            />

            <div
              style={{
                border: "3px solid var(--nb-ink)",
                boxShadow: "4px 4px 0 var(--nb-ink)",
                background: "#fff",
                padding: 12,
                marginTop: 12,
              }}
            >
              <DdocEditor
                initialContent={rulesDocContent}
                onChange={(doc) => {
                  if (doc && typeof doc === "object") {
                    setRulesDocTouched(true);
                    setRulesDocContent(doc);
                  }
                }}
                documentStyling={{
                  canvasBackground: "#ffffff",
                  textColor: "#000000",
                  fontFamily: "Inter, sans-serif",
                }}
                editorCanvasClassNames="max-w-3xl mx-auto"
              />
            </div>

            <p className="wizard-help" style={{ marginTop: 8 }}>
              This document will be published to IPFS via Pinata and linked to this agent record on creation.
            </p>
          </div>
        </div>

        {selfOwnedUnavailable && (
          <div className="wizard-review-callout">
            <div className="alert alert-warning">
              Self-owned ENS is not yet automated end-to-end from this server. Use your connected wallet in ENS App to register or manage the domain and pay ENS gas there.
            </div>
            <div className="wizard-actions">
              <a href={ensAppUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                Open ENS App
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    domainMode: "managed",
                    selectedDomain: domainOptions[0] ?? "vcrtcorp.eth",
                  }));
                  setCurrentStep(1);
                }}
              >
                Switch to managed domain
              </button>
            </div>
          </div>
        )}

        <div className="wizard-reference-strip">
          {sdkReferences.map((reference) => (
            <code key={reference} className="wizard-reference-pill">
              {reference}
            </code>
          ))}
        </div>
      </div>
    );
  };

  const showProgress = Boolean(jobId) && !successResult;
  const currentConfigStep = FLOW_STEPS[currentStep];

  return (
    <div className="page wizard-shell">
      <div className="container">
        <div className="wizard-hero">
          <div>
            <div className="badge badge-blue" style={{ marginBottom: 14 }}>
              Guided agent launch
            </div>
            <h1>Set up one agent, one decision at a time.</h1>
            <p>
              The frontend now captures the creator wallet, explains ENS fee responsibility, and keeps the live SDK-backed launch flow visible while the backend works.
            </p>
          </div>

          <div className="wizard-status-card">
            <strong>
              {readiness.loading
                ? "Checking backend setup..."
                : readiness.ready
                  ? "Backend is ready to create agents"
                  : "Backend setup needs attention"}
            </strong>
            <p>
              {readiness.loading
                ? "Loading domains, token options, and SDK readiness."
                : readiness.error
                  ? readiness.error
                  : readiness.ready
                    ? "Managed domains are ready for one-click creation from the frontend."
                    : `Missing environment: ${readiness.missing.join(", ")}`}
            </p>
            <div className="wizard-status-meta">
              <div className="wizard-status-meta-row">
                <span>Creator wallet</span>
                <strong className="mono">{shortenAddress(wallet.address)}</strong>
              </div>
              {signingAddress && (
                <div className="wizard-status-meta-row">
                  <span>Backend signer</span>
                  <strong className="mono">{shortenAddress(signingAddress)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!showProgress && (
          <div className="wizard-layout">
            <aside className="wizard-sidebar">
              <div className="card wizard-sidebar-card">
                <div className="wizard-sidebar-header">
                  <span className="badge badge-gray">Progress</span>
                  <button type="button" className="btn btn-ghost" onClick={fillDemo}>
                    Demo values
                  </button>
                </div>
                <div className="wizard-step-list">
                  {FLOW_STEPS.map((step, index) => (
                    <StepPill
                      key={step.key}
                      index={index}
                      step={step}
                      active={index === currentStep}
                      complete={index < currentStep}
                    />
                  ))}
                </div>

                <div className="wizard-sidebar-summary">
                  <span className="wizard-sidebar-summary-label">ENS preview</span>
                  <strong className="mono">{ensPreview}</strong>
                </div>
                <div className="wizard-sidebar-summary">
                  <span className="wizard-sidebar-summary-label">Creator wallet</span>
                  <strong className="mono">{wallet.address || "Connect in step 3"}</strong>
                </div>
                <div className="wizard-sidebar-summary">
                  <span className="wizard-sidebar-summary-label">Fee model</span>
                  <strong>
                    {form.domainMode === "managed"
                      ? "Backend signer covers ENS writes"
                      : "Connected wallet covers ENS gas"}
                  </strong>
                </div>
              </div>
            </aside>

            <section className="card wizard-main-card">
              <div className="wizard-main-header">
                <div>
                  <span className="badge badge-purple">{currentConfigStep.kicker}</span>
                  <h2>{currentConfigStep.title}</h2>
                </div>
                <p className="wizard-step-counter">
                  Step {currentStep + 1} of {FLOW_STEPS.length}
                </p>
              </div>

              {renderCurrentStep()}

              <div className="wizard-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCurrentStep((current) => Math.max(0, current - 1))}
                  disabled={currentStep === 0}
                >
                  Back
                </button>
                {currentStep < FLOW_STEPS.length - 1 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (!isStepValid()) {
                        setError("Please complete this step before continuing.");
                        return;
                      }
                      setError("");
                      setCurrentStep((current) => current + 1);
                    }}
                    disabled={!readiness.ready}
                  >
                    Continue
                  </button>
                ) : selfOwnedUnavailable ? (
                  <a href={ensAppUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                    Open ENS App
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submit}
                    disabled={!isStepValid() || !readiness.ready || rulesDocPublishing}
                  >
                    {rulesDocPublishing ? "Publishing rules document..." : "Create agent"}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {showProgress && (
          <div className="wizard-progress-layout">
            <div className="card wizard-progress-card">
              <div className="wizard-main-header">
                <div>
                  <span className="badge badge-blue">Creating agent</span>
                  <h2>Live backend checklist</h2>
                </div>
                <p className="wizard-step-counter">
                  {job?.status === "failed" ? "Needs attention" : "Running"}
                </p>
              </div>

              <div className="wizard-job-steps">
                {(job?.steps ?? []).map((step) => (
                  <div key={step.key} className={`wizard-job-step ${step.status}`}>
                    <span className="wizard-job-step-icon">
                      {step.status === "completed"
                        ? "Done"
                        : step.status === "failed"
                          ? "Stop"
                          : step.status === "active"
                            ? "Live"
                            : "Next"}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.status}</p>
                    </div>
                  </div>
                ))}
              </div>

              {job?.status === "failed" && (
                <div className="wizard-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setJobId("")}>
                    Back to review
                  </button>
                </div>
              )}
            </div>

            <div className="card wizard-log-card">
              <div className="wizard-main-header">
                <div>
                  <span className="badge badge-gray">Server log</span>
                  <h2>What is happening right now</h2>
                </div>
                <p className="wizard-step-counter">{job?.logs?.length ?? 0} events</p>
              </div>

              <div className="wizard-log-stream">
                {(job?.logs ?? []).map((entry) => (
                  <div key={entry.id} className="wizard-log-line">
                    <span className="wizard-log-time">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <code>{entry.message}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {successResult && (
          <div className="wizard-success-overlay">
            <div className="wizard-success-modal">
              <div className="wizard-main-header">
                <div>
                  <span className="badge" style={{ background: "var(--nb-ok)", color: "var(--nb-ink)" }}>
                    Agent created
                  </span>
                  <h2>{successResult.record.ensName}</h2>
                </div>
                <button type="button" className="btn btn-ghost" onClick={resetAll}>
                  Close
                </button>
              </div>

              <div className="wizard-success-grid">
                <div className="wizard-review-item">
                  <span>ENS address</span>
                  <strong className="mono">{successResult.record.ensName}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Agent ID</span>
                  <strong>{successResult.record.agentId}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Wallet address</span>
                  <strong className="mono">{successResult.record.walletAddress}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Policy URI</span>
                  <strong className="mono">{successResult.record.policyUri}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Creator wallet</span>
                  <strong className="mono">{successResult.ownership?.creatorAddress || wallet.address}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Backend signer</span>
                  <strong className="mono">{successResult.ownership?.signingAddress || signingAddress}</strong>
                </div>
                <div className="wizard-review-item">
                  <span>Rules doc (from DB)</span>
                  {dbRulesDocumentUrl ? (
                    <a href={dbRulesDocumentUrl} target="_blank" rel="noreferrer" className="mono">
                      Open rules document
                    </a>
                  ) : (
                    <strong>Loading or unavailable</strong>
                  )}
                </div>
                {rulesDocViewCid && (
                  <div className="wizard-review-item">
                    <span>Rules doc CID</span>
                    <strong className="mono">{rulesDocViewCid}</strong>
                  </div>
                )}
              </div>

              <div className="wizard-success-links">
                <a href={successResult.links.ensApp} target="_blank" rel="noreferrer" className="btn btn-primary">
                  View on ENS
                </a>
                <a href={successResult.links.ipfs} target="_blank" rel="noreferrer" className="btn btn-primary">
                  View on IPFS
                </a>
                <a href={successResult.links.registrationTx} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  Registration tx
                </a>
                <a href={successResult.links.ensTx} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  ENS tx
                </a>
                {renderableRulesDocumentUrl && (
                  <a href={renderableRulesDocumentUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                    Open rules doc
                  </a>
                )}
                {rulesDocViewCid && (
                  <Link to={`/doc/${rulesDocViewCid}`} className="btn btn-primary">
                    Open Fileverse viewer
                  </Link>
                )}
              </div>

              <div className="wizard-review-grid">
                <div className="wizard-review-item wide">
                  <span>Permissions</span>
                  <div className="wizard-review-tags">
                    <code className="wizard-review-tag">
                      Max per payment: {formatMoney(successResult.permissions.maxPerTxUsdc)}
                    </code>
                    <code className="wizard-review-tag">
                      Daily limit: {formatMoney(successResult.permissions.dailyLimitUsdc)}
                    </code>
                    {successResult.permissions.allowedTokens.map((token) => (
                      <code key={token} className="wizard-review-tag">{token}</code>
                    ))}
                    {successResult.permissions.allowedChains.map((chain) => (
                      <code key={chain} className="wizard-review-tag">{chain}</code>
                    ))}
                    {successResult.permissions.allowedRecipients.map((recipient) => (
                      <code key={recipient} className="wizard-review-tag">{recipient}</code>
                    ))}
                    {successResult.permissions.allowedHours && (
                      <code className="wizard-review-tag">
                        {successResult.permissions.allowedHours[0]}:00 to {successResult.permissions.allowedHours[1]}:00 UTC
                      </code>
                    )}
                  </div>
                </div>
                {successResult.ownership && (
                  <div className="wizard-review-item wide">
                    <span>Ownership</span>
                    <div className="wizard-review-tags">
                      <code className="wizard-review-tag">{successResult.ownership.domainMode}</code>
                      <code className="wizard-review-tag">{successResult.ownership.feeResponsibility}</code>
                    </div>
                  </div>
                )}
              </div>

              <div className="wizard-actions">
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
