// Shared API client for VCR Protocol backend
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const vcr = {
  // Health
  health: () => api("/api/health"),

  // Policy
  createPolicy: (body) => api("/api/policy", { method: "POST", body }),
  getPolicy: (ensName) => api(`/api/policy/${ensName}`),
  setENSRecords: (body) => api("/api/policy/ens", { method: "PUT", body }),

  // Verify
  verify: (ensName, spendRequest) =>
    api("/api/verify", { method: "POST", body: { ensName, spendRequest } }),
  recordSpend: (ensName, token, amount) =>
    api("/api/verify/record", { method: "POST", body: { ensName, token, amount } }),
  getDailySpent: (ensName, token) => api(`/api/verify/daily/${ensName}/${token}`),
  getHistory: (ensName) => api(`/api/verify/history/${ensName}`),
  getLogs: (ensName) => api(`/api/verify/logs/${ensName}`),

  // Register
  registerAgent: (body) => api("/api/register", { method: "POST", body }),
  getAgent: (agentId) => api(`/api/register/${agentId}`),

  // Demo
  simulate: (body) => api("/api/demo/simulate", { method: "POST", body }),
};
