import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { vcr } from "../../lib/api";
import { buildIpfsGatewayUrl, extractCidFromValue } from "../../utils/ipfs";

function getWalletProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ethereum ?? null;
}

function shortenAddress(value = "") {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function toGatewayUrl(value = "") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";

  const cid = extractCidFromValue(normalized);
  if (cid) {
    return buildIpfsGatewayUrl(cid);
  }

  return normalized;
}

function toReadableCid(value = "") {
  return extractCidFromValue(value) || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function buildProfileUpdateMessage(agentId, ensName, issuedAt) {
  return [
    "VCR ENS profile update",
    `Agent ID: ${agentId}`,
    `ENS: ${ensName}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

function AgentCard({ agent, onSelect, owned }) {
  const headerImageUrl = toGatewayUrl(agent.headerUri || "");
  const avatarImageUrl = toGatewayUrl(agent.avatarUri || "");
  const rulesDocLink = toGatewayUrl(agent.rulesDocumentUrl || "");
  const policyCid = agent.policyCid || toReadableCid(agent.policyUri || "") || "Not available";
  const rulesDocCid = toReadableCid(agent.rulesDocumentUrl || "") || "Not available";
  const hasRulesDoc = Boolean(rulesDocLink || rulesDocCid !== "Not available");

  return (
    <button
      type="button"
      className="card"
      onClick={() => onSelect(agent)}
      style={{
        textAlign: "left",
        display: "grid",
        gap: 16,
        background: owned
          ? "linear-gradient(135deg, rgba(99,210,255,0.10), rgba(167,139,250,0.08))"
          : "var(--nb-board)",
      }}
    >
      {headerImageUrl ? (
        <div
          style={{
            height: 140,
            borderRadius: 18,
            backgroundImage: `linear-gradient(rgba(17,24,39,0.18), rgba(17,24,39,0.18)), url(${headerImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            border: "3px solid var(--nb-ink)",
            boxShadow: "4px 4px 0 var(--nb-ink)",
          }}
        />
      ) : (
        <div
          style={{
            height: 140,
            borderRadius: 18,
            background: "linear-gradient(135deg, #fef3c7, #dbeafe)",
            border: "3px solid var(--nb-ink)",
            boxShadow: "4px 4px 0 var(--nb-ink)",
          }}
        />
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            overflow: "hidden",
            border: "3px solid var(--nb-ink)",
            background: "#fff",
            boxShadow: "4px 4px 0 var(--nb-ink)",
            flexShrink: 0,
          }}
        >
          {avatarImageUrl ? (
            <img
              src={avatarImageUrl}
              alt={agent.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
              }}
            >
              {agent.name?.slice(0, 1)?.toUpperCase() || "A"}
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="badge badge-blue">Agent #{agent.agentId}</span>
            {owned ? <span className="badge badge-purple">My agent</span> : null}
            {hasRulesDoc ? <span className="badge badge-gray">dDoc linked</span> : null}
          </div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: 6 }}>{agent.ensName || agent.name}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: 10 }}>
            {agent.description || "No description provided yet."}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(agent.supportedTokens || []).map((token) => (
              <span key={token} className="badge badge-green">{token}</span>
            ))}
            {(agent.supportedChains || []).map((chain) => (
              <span key={chain} className="badge badge-gray">{chain}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
            <p className="mono" style={{ fontSize: "0.72rem", opacity: 0.8 }}>
              Policy CID: {policyCid}
            </p>
            <p className="mono" style={{ fontSize: "0.72rem", opacity: 0.8 }}>
              dDoc CID: {rulesDocCid}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PolicyExplorer() {
  const [search, setSearch] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingMine, setLoadingMine] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("lookup");
  const [wallet, setWallet] = useState({ address: "", status: "idle", error: "" });
  const [allAgents, setAllAgents] = useState([]);
  const [myAgents, setMyAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [headerFile, setHeaderFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [headerPreview, setHeaderPreview] = useState("");
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [loadingEnsRecords, setLoadingEnsRecords] = useState(false);
  const [ensRecords, setEnsRecords] = useState(null);

  const connectWallet = async () => {
    const provider = getWalletProvider();
    if (!provider) {
      setWallet({ address: "", status: "error", error: "Install a wallet like MetaMask to load your agents." });
      return;
    }

    setWallet((current) => ({ ...current, status: "connecting", error: "" }));

    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] ?? "" : "";
      if (!address) {
        throw new Error("No wallet account returned.");
      }

      setWallet({ address, status: "connected", error: "" });
    } catch (walletError) {
      setWallet({ address: "", status: "error", error: walletError.message });
    }
  };

  const loadAllAgents = async () => {
    setLoadingAgents(true);
    try {
      const response = await vcr.getAllAgents();
      setAllAgents(response.agents ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadMyAgents = async (address) => {
    if (!address) {
      setMyAgents([]);
      return;
    }

    setLoadingMine(true);
    try {
      const response = await vcr.getAgentsByOwner(address);
      setMyAgents(response.agents ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingMine(false);
    }
  };

  useEffect(() => {
    loadAllAgents();
  }, []);

  useEffect(() => {
    const provider = getWalletProvider();
    if (!provider) {
      return undefined;
    }

    let active = true;

    async function syncWallet() {
      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (!active || !Array.isArray(accounts)) {
          return;
        }

        const address = accounts[0] ?? "";
        setWallet({
          address,
          status: address ? "connected" : "idle",
          error: "",
        });
      } catch (walletError) {
        if (!active) return;
        setWallet({ address: "", status: "error", error: walletError.message });
      }
    }

    function handleAccountsChanged(accounts) {
      if (!active) return;
      const address = accounts?.[0] ?? "";
      setWallet({ address, status: address ? "connected" : "idle", error: "" });
    }

    syncWallet();
    provider.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  useEffect(() => {
    if (wallet.address) {
      loadMyAgents(wallet.address);
    } else {
      setMyAgents([]);
    }
  }, [wallet.address]);

  const explore = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoadingLookup(true);
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
      setLoadingLookup(false);
    }
  };

  const policy = result?.policy;
  const c = policy?.constraints;

  const selectedAgentOwned = useMemo(() => {
    if (!selectedAgent || !wallet.address) return false;
    const address = wallet.address.toLowerCase();
    return (
      selectedAgent.ownerAddress?.toLowerCase() === address ||
      selectedAgent.creatorAddress?.toLowerCase() === address
    );
  }, [selectedAgent, wallet.address]);

  const selectedAgentUriLink = selectedAgent
    ? toGatewayUrl(selectedAgent.agentUri || "")
    : "";
  const selectedPolicyCid = selectedAgent
    ? selectedAgent.policyCid || toReadableCid(selectedAgent.policyUri || "") || ""
    : "";
  const selectedPolicyLink = selectedAgent
    ? toGatewayUrl(selectedAgent.policyUri || selectedPolicyCid)
    : "";
  const selectedRulesDocCid = selectedAgent
    ? toReadableCid(selectedAgent.rulesDocumentUrl || "")
    : "";
  const selectedRulesDocLink = selectedAgent
    ? toGatewayUrl(selectedAgent.rulesDocumentUrl || "")
    : "";
  const selectedRulesDocViewUrl = selectedRulesDocLink || selectedAgent?.rulesDocumentUrl || "";
  const selectedRulesDocRawPreview = selectedAgent?.rulesDocumentRaw
    ? String(selectedAgent.rulesDocumentRaw).slice(0, 220)
    : "";
  const selectedAvatarLink = selectedAgent
    ? toGatewayUrl(selectedAgent.avatarUri || "")
    : "";
  const selectedHeaderLink = selectedAgent
    ? toGatewayUrl(selectedAgent.headerUri || "")
    : "";

  useEffect(() => {
    if (!selectedAgent?.agentId) {
      setEnsRecords(null);
      return;
    }

    let active = true;

    async function loadEnsRecords() {
      setLoadingEnsRecords(true);
      try {
        const response = await vcr.getAgentEnsRecords(selectedAgent.agentId);
        if (!active) return;
        setEnsRecords(response.records ?? null);
      } catch (recordsError) {
        if (!active) return;
        setEnsRecords({ error: recordsError.message });
      } finally {
        if (active) {
          setLoadingEnsRecords(false);
        }
      }
    }

    loadEnsRecords();

    return () => {
      active = false;
    };
  }, [selectedAgent?.agentId]);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(await fileToDataUrl(file));
  };

  const handleHeaderChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setHeaderFile(file);
    setHeaderPreview(await fileToDataUrl(file));
  };

  const uploadProfile = async () => {
    if (!selectedAgent) return;
    if (!avatarPreview && !headerPreview) {
      setError("Choose an avatar or header image before uploading.");
      return;
    }

    setUploadingProfile(true);
    setError("");

    try {
      const provider = getWalletProvider();
      if (!provider || !wallet.address) {
        throw new Error("Connect the creator wallet before updating ENS profile media.");
      }

      const issuedAt = new Date().toISOString();
      const message = buildProfileUpdateMessage(
        selectedAgent.agentId,
        selectedAgent.ensName,
        issuedAt,
      );
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      });

      const response = await vcr.updateAgentProfile(selectedAgent.agentId, {
        avatarDataUrl: avatarPreview || undefined,
        headerDataUrl: headerPreview || undefined,
        actorAddress: wallet.address,
        issuedAt,
        signature,
      });

      const updatedAgent = response.agent;
      setSelectedAgent(updatedAgent);
      setAllAgents((current) =>
        current.map((agent) => (agent.agentId === updatedAgent.agentId ? updatedAgent : agent)),
      );
      setMyAgents((current) =>
        current.map((agent) => (agent.agentId === updatedAgent.agentId ? updatedAgent : agent)),
      );
      setAvatarFile(null);
      setHeaderFile(null);
      setAvatarPreview("");
      setHeaderPreview("");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingProfile(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="badge badge-amber" style={{ marginBottom: 12 }}>
            ENS + Agent Directory
          </div>
          <h1>Agent Explorer</h1>
          <p>
            Search any ENS-linked policy, inspect your own agents, browse the full agent directory, and manage ENS avatar and header records from one place.
          </p>
        </div>

        <div className="tabs" style={{ marginBottom: 28 }}>
          {[
            { id: "lookup", label: "Policy Lookup" },
            { id: "mine", label: "My Agents" },
            { id: "all", label: "All Agents" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="alert alert-error" style={{ maxWidth: 920, margin: "0 auto 24px" }}>
            {error}
          </div>
        ) : null}

        {activeTab === "lookup" && (
          <>
            <form onSubmit={explore} style={{ display: "flex", gap: 12, maxWidth: 560, margin: "0 auto 56px" }}>
              <input
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="youragent.eth"
                style={{ flex: 1, fontSize: "1rem" }}
              />
              <button className="btn btn-primary" type="submit" disabled={loadingLookup || !search.trim()}>
                {loadingLookup ? <div className="spinner" /> : "Search"}
              </button>
            </form>

            {result && policy && (
              <>
                <div className="card" style={{ marginBottom: 24, background: "linear-gradient(135deg, rgba(99,210,255,0.05), rgba(167,139,250,0.05))" }}>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
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
                    </div>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="card">
                    <div className="card-header"><h2>Policy summary</h2></div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div className="code-block">Max transaction: {c?.maxTransaction?.amount} {c?.maxTransaction?.token}</div>
                      <div className="code-block">Daily limit: {c?.dailyLimit?.amount} {c?.dailyLimit?.token}</div>
                      <div className="code-block">Allowed chains: {c?.allowedChains?.join(", ")}</div>
                      <div className="code-block">Allowed tokens: {c?.allowedTokens?.join(", ")}</div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header"><h2>Recipients</h2></div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {c?.allowedRecipients?.map((addr) => (
                        <div key={addr} className="code-block" style={{ fontSize: "0.78rem", padding: "8px 12px" }}>
                          {addr}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 24 }}>
                  <div className="card-header"><h2>Spend history</h2></div>
                  {!history?.history?.length ? (
                    <p style={{ color: "var(--text-muted)" }}>No spend history found.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {history.history.map((row, index) => (
                        <div key={`${row.date}-${index}`} className="tx-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{row.date}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{row.token}</div>
                          </div>
                          <div className="mono">{row.amountSpent}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {!result && !loadingLookup && !error ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
                <p>Enter an ENS name above to resolve its VCR policy and recorded spend history.</p>
              </div>
            ) : null}
          </>
        )}

        {activeTab === "mine" && (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <div>
                  <h2>My agents</h2>
                  <p>Connect the wallet you used to create agents to load your directory.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={connectWallet}>
                  {wallet.status === "connecting" ? "Connecting..." : wallet.address ? "Reconnect wallet" : "Connect wallet"}
                </button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div className="code-block">Connected wallet: {wallet.address || "Not connected"}</div>
                {wallet.error ? <div className="alert alert-error">{wallet.error}</div> : null}
              </div>
            </div>

            {loadingMine ? (
              <div className="card"><p>Loading your agents...</p></div>
            ) : myAgents.length === 0 ? (
              <div className="card">
                <p style={{ color: "var(--text-muted)" }}>
                  {wallet.address
                    ? "No agents found for this wallet yet."
                    : "Connect a wallet to load your agents."}
                </p>
              </div>
            ) : (
              <div className="grid-2">
                {myAgents.map((agent) => (
                  <AgentCard key={agent.agentId} agent={agent} onSelect={setSelectedAgent} owned />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "all" && (
          <>
            {loadingAgents ? (
              <div className="card"><p>Loading the full agent directory...</p></div>
            ) : (
              <div className="grid-2">
                {allAgents.map((agent) => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    onSelect={setSelectedAgent}
                    owned={
                      Boolean(wallet.address) &&
                      (
                        agent.ownerAddress?.toLowerCase() === wallet.address.toLowerCase() ||
                        agent.creatorAddress?.toLowerCase() === wallet.address.toLowerCase()
                      )
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {selectedAgent ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17,24,39,0.45)",
              backdropFilter: "blur(6px)",
              zIndex: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div className="card" style={{ width: "min(960px, 100%)", maxHeight: "calc(100vh - 48px)", overflow: "auto" }}>
              <div className="card-header">
                <div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <span className="badge badge-blue">Agent #{selectedAgent.agentId}</span>
                    {selectedAgentOwned ? <span className="badge badge-purple">Editable</span> : null}
                  </div>
                  <h2>{selectedAgent.ensName}</h2>
                  <p>{selectedAgent.description || "No description provided yet."}</p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedAgent(null)}>
                  Close
                </button>
              </div>

              {selectedHeaderLink ? (
                <div
                  style={{
                    height: 200,
                    borderRadius: 18,
                    marginBottom: 20,
                    backgroundImage: `url(${selectedHeaderLink})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    border: "3px solid var(--nb-ink)",
                    boxShadow: "4px 4px 0 var(--nb-ink)",
                  }}
                />
              ) : null}

              <div className="grid-2">
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><h2>Identity</h2></div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="code-block">ENS: {selectedAgent.ensName}</div>
                    <div className="code-block">Wallet: {selectedAgent.agentWalletAddress || selectedAgent.walletAddress || "Not available"}</div>
                    <div className="code-block">Creator: {selectedAgent.creatorAddress || "Not recorded"}</div>
                    <div className="code-block">Signer/owner: {selectedAgent.ownerAddress || "Not recorded"}</div>
                    <div className="code-block">Created: {formatDate(selectedAgent.createdAt)}</div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><h2>Permissions</h2></div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    {(selectedAgent.supportedTokens || []).map((token) => (
                      <span key={token} className="badge badge-green">{token}</span>
                    ))}
                    {(selectedAgent.supportedChains || []).map((chain) => (
                      <span key={chain} className="badge badge-blue">{chain}</span>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="code-block">Policy URI: {selectedPolicyLink || "Not available"}</div>
                    <div className="code-block">Policy CID: {selectedPolicyCid || "Not available"}</div>
                    <div className="code-block">Registration tx: {selectedAgent.registrationTxHash || selectedAgent.registrationTx || "Not available"}</div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 20, marginBottom: 0 }}>
                <div className="card-header"><h2>Documents & ENS records</h2></div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div className="code-block">Agent URI: {selectedAgentUriLink || "Not available"}</div>
                  <div className="code-block">Rules dDoc URL: {selectedRulesDocLink || selectedAgent.rulesDocumentUrl || "Not available"}</div>
                  <div className="code-block">Rules dDoc CID: {selectedRulesDocCid || "Not available"}</div>
                  <div className="code-block">Rules raw snapshot: {selectedRulesDocRawPreview || "Not available"}</div>
                  <div className="code-block">Rules source: {selectedAgent.rulesDocumentSource || "Not available"}</div>
                  <div className="code-block">Avatar URI (DB): {selectedAvatarLink || "Not available"}</div>
                  <div className="code-block">Header URI (DB): {selectedHeaderLink || "Not available"}</div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                  {selectedRulesDocCid ? (
                    <Link to={`/doc/${selectedRulesDocCid}`} className="btn btn-primary">
                      View dDoc
                    </Link>
                  ) : selectedRulesDocViewUrl ? (
                    <a href={selectedRulesDocViewUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                      View dDoc
                    </a>
                  ) : null}
                  {selectedRulesDocLink && selectedRulesDocCid ? (
                    <a href={selectedRulesDocLink} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Open raw dDoc
                    </a>
                  ) : null}
                  {selectedPolicyLink ? (
                    <a href={selectedPolicyLink} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Open policy IPFS
                    </a>
                  ) : null}
                </div>

                <div style={{ marginTop: 18 }}>
                  <h3 style={{ marginBottom: 10 }}>Live ENS text records</h3>
                  {loadingEnsRecords ? (
                    <p>Loading live ENS records...</p>
                  ) : ensRecords?.error ? (
                    <div className="alert alert-error">{ensRecords.error}</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div className="code-block">agent-registration: {ensRecords?.agentRegistration || "Not set"}</div>
                      <div className="code-block">contenthash policy: {ensRecords?.policyContenthashUri || "Not set"}</div>
                      <div className="code-block">vcr.policy text: {ensRecords?.legacyPolicyText || "Not set"}</div>
                      <div className="code-block">avatar text: {ensRecords?.avatar || "Not set"}</div>
                      <div className="code-block">header text: {ensRecords?.header || "Not set"}</div>
                    </div>
                  )}
                </div>
              </div>

              {selectedAgentOwned ? (
                <div className="card" style={{ marginTop: 20, marginBottom: 0 }}>
                  <div className="card-header">
                    <div>
                      <h2>ENS profile media</h2>
                      <p>Upload an avatar and a header image. These are written to the ENS `avatar` and `header` text records.</p>
                    </div>
                  </div>

                  <div className="grid-2">
                    <div>
                      <label className="form-label">Avatar image</label>
                      <input type="file" accept="image/*" onChange={handleAvatarChange} />
                      <div style={{ marginTop: 16 }}>
                        {avatarPreview || selectedAvatarLink ? (
                          <img
                            src={avatarPreview || selectedAvatarLink}
                            alt="Avatar preview"
                            style={{
                              width: 140,
                              height: 140,
                              borderRadius: "50%",
                              objectFit: "cover",
                              border: "3px solid var(--nb-ink)",
                              boxShadow: "4px 4px 0 var(--nb-ink)",
                            }}
                          />
                        ) : (
                          <div className="code-block">No avatar uploaded yet</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Header image</label>
                      <input type="file" accept="image/*" onChange={handleHeaderChange} />
                      <div style={{ marginTop: 16 }}>
                        {headerPreview || selectedHeaderLink ? (
                          <div
                            style={{
                              height: 140,
                              borderRadius: 18,
                              backgroundImage: `url(${headerPreview || selectedHeaderLink})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                              border: "3px solid var(--nb-ink)",
                              boxShadow: "4px 4px 0 var(--nb-ink)",
                            }}
                          />
                        ) : (
                          <div className="code-block">No header uploaded yet</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
                    <button type="button" className="btn btn-primary" onClick={uploadProfile} disabled={uploadingProfile}>
                      {uploadingProfile ? "Uploading..." : "Upload to ENS profile"}
                    </button>
                    {selectedAvatarLink ? (
                      <a href={selectedAvatarLink} target="_blank" rel="noreferrer" className="btn btn-ghost">
                        Open avatar
                      </a>
                    ) : null}
                    {selectedHeaderLink ? (
                      <a href={selectedHeaderLink} target="_blank" rel="noreferrer" className="btn btn-ghost">
                        Open header
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
