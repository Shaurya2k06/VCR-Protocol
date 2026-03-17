const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && payload.error) ||
      (typeof payload === "string" && payload) ||
      response.statusText ||
      `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function raw(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

export const vcr = {
  // Health / status
  health: () => api("/api/health"),
  status: () => api("/api/health"),

  // Policy
  createPolicy: (body) => api("/api/policy", { method: "POST", body }),
  getPolicy: (ensName) => api(`/api/policy/${encodeURIComponent(ensName)}`),
  setENSRecords: (body) => api("/api/policy/ens", { method: "PUT", body }),

  // Verify
  verify: (ensName, spendRequest) =>
    api("/api/verify", { method: "POST", body: { ensName, spendRequest } }),
  recordSpend: (ensName, token, amount) =>
    api("/api/verify/record", {
      method: "POST",
      body: { ensName, token, amount },
    }),
  getDailySpent: (ensName, token) =>
    api(
      `/api/verify/daily/${encodeURIComponent(ensName)}/${encodeURIComponent(token)}`,
    ),
  getHistory: (ensName) =>
    api(`/api/verify/history/${encodeURIComponent(ensName)}`),
  getLogs: (ensName) => api(`/api/verify/logs/${encodeURIComponent(ensName)}`),

  // Register
  getRegistrationReadiness: () => api("/api/register/readiness"),
  startRegistrationJob: (body) => api("/api/register/jobs", { method: "POST", body }),
  getRegistrationJob: (jobId) =>
    api(`/api/register/jobs/${encodeURIComponent(jobId)}`),
  registerAgent: (body) => api("/api/register", { method: "POST", body }),
  getAllAgents: () => api("/api/register/list"),
  getAgent: (agentId) => api(`/api/register/${encodeURIComponent(agentId)}`),
  getAgentEnsRecords: (agentId) =>
    api(`/api/register/${encodeURIComponent(agentId)}/ens-records`),
  getAgentsByOwner: (address) =>
    api(`/api/register/owner/${encodeURIComponent(address)}`),
  updateAgentProfile: (agentId, body) =>
    api(`/api/register/${encodeURIComponent(agentId)}/profile`, {
      method: "PUT",
      body,
    }),
  updateAgentPolicy: (agentId, body) =>
    api(`/api/register/${encodeURIComponent(agentId)}/policy`, {
      method: "PUT",
      body,
    }),
  updateAgentRulesDocument: (agentId, body) =>
    api(`/api/register/${encodeURIComponent(agentId)}/rules`, {
      method: "PUT",
      body,
    }),
  prepareSelfOwnedEnsSetup: (agentId, body) =>
    api(`/api/register/${encodeURIComponent(agentId)}/self-owned/prepare`, {
      method: "POST",
      body,
    }),
  completeSelfOwnedEnsSetup: (agentId, body) =>
    api(`/api/register/${encodeURIComponent(agentId)}/self-owned/complete`, {
      method: "POST",
      body,
    }),

  // Wallet
  createWallet: (body) => api("/api/wallet", { method: "POST", body }),
  getWallet: (walletId) => api(`/api/wallet/${encodeURIComponent(walletId)}`),
  getWalletPolicy: (walletId) =>
    api(`/api/wallet/${encodeURIComponent(walletId)}/policy`),
  setWalletPolicy: (walletId, body) =>
    api(`/api/wallet/${encodeURIComponent(walletId)}/policy`, {
      method: "PUT",
      body,
    }),
  sendWalletTransaction: (walletId, body) =>
    api(`/api/wallet/${encodeURIComponent(walletId)}/send`, {
      method: "POST",
      body,
    }),
  approvePendingApproval: (approvalId) =>
    api(`/api/wallet/approval/${encodeURIComponent(approvalId)}/approve`, {
      method: "POST",
    }),
  rejectPendingApproval: (approvalId) =>
    api(`/api/wallet/approval/${encodeURIComponent(approvalId)}/reject`, {
      method: "POST",
    }),

  // Demo / paywall
  simulate: (body) => api("/api/demo/simulate", { method: "POST", body }),
  runProtocolSuite: (ensName, body = {}) =>
    api(`/api/demo/suite/${encodeURIComponent(ensName)}`, {
      method: "POST",
      body,
    }),
  checkDemoRequest: (body) =>
    api("/api/demo/check", {
      method: "POST",
      body,
    }),
  settleDemoRequest: (body) =>
    api("/api/demo/settle", {
      method: "POST",
      body,
    }),
  getFeaturedDemoAgent: () => api("/api/demo/featured-agent"),
  getIncidentDemos: (ensName) =>
    api(`/api/demo/incidents/${encodeURIComponent(ensName)}`),
  getDemoDaily: (ensName, token) =>
    api(
      `/api/demo/daily/${encodeURIComponent(ensName)}/${encodeURIComponent(token)}`,
    ),
  resetDemoDaily: (ensName, token) =>
    api(
      `/api/demo/daily/${encodeURIComponent(ensName)}/${encodeURIComponent(token)}/reset`,
      { method: "POST" },
    ),
  getDemoLogs: (ensName) =>
    api(`/api/demo/logs/${encodeURIComponent(ensName)}`),

  // Raw paywall helpers
  getPaywallContent: (headers = {}) =>
    raw("/api/demo/content", {
      method: "GET",
      headers,
    }),
  getPaymentRequired: async (headers = {}) => {
    const response = await raw("/api/demo/content", {
      method: "GET",
      headers,
    });

    return {
      ok: response.ok,
      status: response.status,
      paymentRequired: response.headers.get("PAYMENT-REQUIRED"),
      paymentResponse: response.headers.get("PAYMENT-RESPONSE"),
      body: await response.json().catch(() => null),
    };
  },
};

export { API_BASE, api, raw };
