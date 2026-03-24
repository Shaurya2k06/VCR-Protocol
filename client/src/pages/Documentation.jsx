import React, { useState } from 'react';

/* ================================================================== */
/*  VCR Protocol SDK — Documentation Page                              */
/*  @shaurya2k06/vcrsdk                                                */
/* ================================================================== */

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Installation' },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'policy', label: 'Policy' },
  { id: 'verifier', label: 'Verifier' },
  { id: 'agent', label: 'Agent Lifecycle' },
  { id: 'ens', label: 'ENS' },
  { id: 'erc8004', label: 'ERC-8004' },
  { id: 'bitgo', label: 'BitGo' },
  { id: 'x402', label: 'x402' },
  { id: 'contract', label: 'On-Chain Registry' },
  { id: 'types', label: 'Types' },
  { id: 'constants', label: 'Constants' },
];

function CodeBlock({ title, lang = 'ts', children }) {
  return (
    <div style={{ background: '#111827', border: '3px solid var(--nb-ink)', boxShadow: '6px 6px 0 var(--nb-ink)', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
      {title && (
        <div style={{ background: 'var(--nb-accent)', color: '#fff', padding: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </div>
      )}
      <pre style={{ margin: 0, padding: '20px', color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre' }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function DocSection({ id, title, badge, badgeColor = 'var(--nb-accent)', children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 100, marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, borderBottom: '3px solid var(--nb-ink)', paddingBottom: 16 }}>
        {badge && (
          <span style={{ background: badgeColor, color: '#fff', padding: '4px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', border: '2px solid var(--nb-ink)', boxShadow: '2px 2px 0 var(--nb-ink)' }}>
            {badge}
          </span>
        )}
        <h2 style={{ margin: 0, fontSize: '1.8rem', textTransform: 'uppercase', letterSpacing: '-0.03em' }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FnCard({ name, signature, description, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#fff', border: '3px solid var(--nb-ink)', boxShadow: '4px 4px 0 var(--nb-ink)', marginBottom: 16, transition: 'transform 0.1s' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--nb-accent)' }}>{name}</span>
          {signature && <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: 8 }}>{signature}</span>}
        </div>
        <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--nb-ink)', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s' }}>+</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '2px dashed var(--nb-ink)' }}>
          {description && <p style={{ margin: '12px 0', fontSize: '0.9rem', lineHeight: 1.6 }}>{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

function TypeBlock({ children }) {
  return (
    <pre style={{ background: '#f8fafc', border: '2px solid var(--nb-ink)', padding: 16, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6, overflowX: 'auto', marginTop: 8 }}>
      <code>{children}</code>
    </pre>
  );
}

function Param({ name, type, desc }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: '0.85rem' }}>
      <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--nb-accent)', whiteSpace: 'nowrap' }}>{name}</code>
      <span style={{ color: '#9ca3af' }}>:</span>
      <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--nb-accent2)', whiteSpace: 'nowrap' }}>{type}</code>
      {desc && <span style={{ color: '#6b7280' }}>— {desc}</span>}
    </div>
  );
}

function ContractTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 24 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '3px solid var(--nb-ink)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: 'var(--nb-ink)', color: '#fff' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', textTransform: 'uppercase', fontWeight: 700 }}>Contract</th>
            <th style={{ padding: '10px 14px', textAlign: 'left', textTransform: 'uppercase', fontWeight: 700 }}>Network</th>
            <th style={{ padding: '10px 14px', textAlign: 'left', textTransform: 'uppercase', fontWeight: 700 }}>Address</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fefce8', borderTop: '2px solid var(--nb-ink)' }}>
              <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r[0]}</td>
              <td style={{ padding: '10px 14px' }}>{r[1]}</td>
              <td style={{ padding: '10px 14px', wordBreak: 'break-all', fontSize: '0.78rem' }}>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Documentation() {
  return (
    <div style={{ background: 'var(--nb-bg)', color: 'var(--nb-ink)', minHeight: '100vh', position: 'relative' }}>
      {/* Grid overlay */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(var(--nb-ink) 1px, transparent 1px), linear-gradient(90deg, var(--nb-ink) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.03, pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        {/* — Sidebar — */}
        <aside style={{ position: 'sticky', top: 80, height: 'calc(100vh - 80px)', overflowY: 'auto', padding: '32px 0 32px 24px', borderRight: '3px solid var(--nb-ink)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--nb-accent)', marginBottom: 20, letterSpacing: '0.1em' }}>
            SDK Reference
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} style={{ textDecoration: 'none', color: 'var(--nb-ink)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, padding: '8px 14px', borderLeft: '3px solid transparent', transition: 'all 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderLeftColor = 'var(--nb-accent)'; e.currentTarget.style.background = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderLeftColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div style={{ marginTop: 32, padding: '16px', background: '#fff', border: '3px solid var(--nb-ink)', boxShadow: '4px 4px 0 var(--nb-ink)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--nb-accent2)', marginBottom: 8 }}>Package</div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>@shaurya2k06/vcrsdk</code>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#9ca3af', marginTop: 6 }}>v1.1.0 · MIT License</div>
          </div>
        </aside>

        {/* — Main Content — */}
        <main style={{ padding: '40px 48px 120px' }}>
          {/* ── Hero ── */}
          <div style={{ marginBottom: 64 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <span className="nb-badge" style={{ color: 'var(--nb-ok)', borderColor: 'var(--nb-ok)', boxShadow: '3px 3px 0 var(--nb-ok)' }}>ERC-8004</span>
              <span className="nb-badge" style={{ color: 'var(--nb-accent)', borderColor: 'var(--nb-accent)', boxShadow: '3px 3px 0 var(--nb-accent)' }}>ENSIP-25</span>
              <span className="nb-badge" style={{ color: 'var(--nb-accent2)', borderColor: 'var(--nb-accent2)', boxShadow: '3px 3px 0 var(--nb-accent2)' }}>x402</span>
              <span className="nb-badge" style={{ color: 'var(--nb-error)', borderColor: 'var(--nb-error)', boxShadow: '3px 3px 0 var(--nb-error)' }}>BitGo</span>
            </div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 0.95, textTransform: 'uppercase', fontFamily: 'var(--font-display)', letterSpacing: '-0.04em', marginBottom: 20 }}>
              VCR Protocol<br/>
              <span style={{ color: 'var(--nb-bg)', background: 'var(--nb-accent)', padding: '0 12px', display: 'inline-block', border: '3px solid var(--nb-ink)', boxShadow: '6px 6px 0 var(--nb-ink)', marginTop: 8 }}>SDK Documentation</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', maxWidth: 650, borderLeft: '4px solid var(--nb-accent)', paddingLeft: 20, lineHeight: 1.6 }}>
              Policy-bound autonomous agent wallets with on-chain verification, ENS integration, x402 payments, and BitGo enforcement.
            </p>
          </div>

          {/* ── Overview ── */}
          <DocSection id="overview" title="Overview" badge="VCR" badgeColor="var(--nb-ink)">
            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, maxWidth: 720, marginBottom: 16 }}>
              <strong>VCR (Verifiable Capability Routing)</strong> is a protocol that constrains how autonomous agents spend funds. ERC-8004 gives agents on-chain identity, x402 gives them HTTP-native payment rails — VCR fills the gap between identity and payment with a verifiable spending policy layer.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { title: 'Policy Schema', desc: 'JSON on IPFS describing spending constraints', color: 'var(--nb-accent)' },
                { title: 'ENS Text Records', desc: 'ENSIP-25 links agent identity to policy CID', color: 'var(--nb-ok)' },
                { title: 'Verifier Library', desc: 'canAgentSpend() checks all constraints', color: 'var(--nb-accent2)' },
              ].map((c, i) => (
                <div key={i} style={{ background: '#fff', border: '3px solid var(--nb-ink)', boxShadow: '4px 4px 0 ' + c.color, padding: 20 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase', marginBottom: 8, color: c.color }}>{c.title}</div>
                  <p style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>{c.desc}</p>
                </div>
              ))}
            </div>
            <CodeBlock title="architecture flow">{`Agent Owner → defines VCR Policy JSON → pins to IPFS → gets CID
Agent Owner → sets ENS text record vcr.policy = ipfs://<CID>
Agent Owner → registers agent on ERC-8004 IdentityRegistry

Service (paywall) → receives x402 payment request from agent
Service → reads agent's ENS → fetches vcr.policy from IPFS
Service → runs canAgentSpend()
  ✓ amount ≤ maxTransaction    ✓ recipient in allowedRecipients
  ✓ cumulative ≤ dailyLimit    ✓ token in allowedTokens
  ✓ chain in allowedChains     ✓ time within allowedHours
If ALL pass → allow x402 payment to proceed`}</CodeBlock>
          </DocSection>

          {/* ── Installation ── */}
          <DocSection id="install" title="Installation" badge="Setup" badgeColor="var(--nb-ok)">
            <CodeBlock title="npm">{`npm install @shaurya2k06/vcrsdk`}</CodeBlock>
            <CodeBlock title="pnpm">{`pnpm add @shaurya2k06/vcrsdk`}</CodeBlock>
            <p style={{ fontSize: '0.9rem', marginBottom: 12 }}><strong>Peer dependencies</strong> (optional):</p>
            <CodeBlock>{`npm install express   # only needed for server middleware (vcrPaymentMiddleware)`}</CodeBlock>
            <p style={{ fontSize: '0.9rem', marginTop: 16 }}><strong>Requirements:</strong> Node.js ≥ 20 &lt; 23 · TypeScript 5.x</p>
          </DocSection>

          {/* ── Quick Start ── */}
          <DocSection id="quickstart" title="Quick Start" badge="Guide" badgeColor="var(--nb-accent2)">
            <CodeBlock title="1. Create a policy">{`import { createPolicy, pinPolicy } from '@shaurya2k06/vcrsdk';

const policy = createPolicy(
  'eip155:11155111:0x8004A818...BD9e:0',
  {
    maxTransaction: { amount: '1000000', token: 'USDC', chain: 'base-sepolia' },
    dailyLimit:     { amount: '5000000', token: 'USDC', chain: 'base-sepolia' },
    allowedRecipients: ['0xServiceA...', '0xServiceB...'],
    allowedTokens: ['USDC'],
    allowedChains: ['base-sepolia'],
    timeRestrictions: { timezone: 'UTC', allowedHours: [9, 17] },
  },
  { createdBy: '0xYourAddress', description: 'Research agent policy' },
);

const { cid, ipfsUri } = await pinPolicy(policy);
console.log('Pinned to IPFS:', ipfsUri);`}</CodeBlock>

            <CodeBlock title="2. Verify a spend request">{`import { canAgentSpend, getDailySpent } from '@shaurya2k06/vcrsdk';

const result = await canAgentSpend(
  'myagent.eth',
  {
    amount: '500000',       // 0.50 USDC
    token: 'USDC',
    recipient: '0xServiceA...',
    chain: 'base-sepolia',
  },
  getDailySpent,            // built-in tracker or your own implementation
);

if (result.allowed) {
  console.log('✓ Payment authorized');
} else {
  console.log('✗ Blocked:', result.reason);
}`}</CodeBlock>

            <CodeBlock title="3. Full agent creation (one-shot orchestrator)">{`import { createAgent } from '@shaurya2k06/vcrsdk';

const record = await createAgent(
  {
    name: 'researcher-001',
    baseDomain: 'acmecorp.eth',
    maxPerTxUsdc: '500',
    dailyLimitUsdc: '5000',
    allowedRecipients: ['0xABC...', '0xDEF...'],
    description: 'Research budget agent',
  },
  {
    BITGO_ACCESS_TOKEN:  process.env.BITGO_ACCESS_TOKEN,
    BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID,
    PINATA_JWT:          process.env.PINATA_JWT,
    PINATA_GATEWAY:      process.env.PINATA_GATEWAY,
    PIMLICO_API_KEY:     process.env.PIMLICO_API_KEY,
    PRIVATE_KEY:         process.env.PRIVATE_KEY,
    SEPOLIA_RPC_URL:     process.env.SEPOLIA_RPC_URL,
  },
);

console.log('Agent created:', record.ensName, 'ID:', record.agentId);`}</CodeBlock>
          </DocSection>

          {/* ── Policy Module ── */}
          <DocSection id="policy" title="Policy Management" badge="policy.ts" badgeColor="var(--nb-accent)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>Create, validate, pin, and fetch VCR policy documents. Uses <code style={{ fontFamily: 'var(--font-mono)' }}>json-stringify-deterministic</code> to ensure CID reproducibility across runtimes.</p>
            <FnCard name="createPolicy" signature="(agentId, constraints, meta?) → VCRPolicy" description="Factory function that creates a validated VCR policy object.">
              <Param name="agentId" type="string" desc="Fully-qualified agent ID (eip155:<chainId>:<registry>:<id>)" />
              <Param name="constraints" type="VCRConstraints" desc="Spending constraints object" />
              <Param name="meta" type="Partial<PolicyMetadata>" desc="Optional metadata (createdBy, description, expiresAt)" />
            </FnCard>
            <FnCard name="validatePolicy" signature="(policy) → void" description="Throws if the policy is malformed. Checks version, amounts, arrays, time ranges, and slippage bounds.">
              <Param name="policy" type="VCRPolicy" desc="Policy to validate" />
            </FnCard>
            <FnCard name="pinPolicy" signature="(policy) → Promise<PinResult>" description="Pins a VCR policy JSON to IPFS via Pinata. Returns { cid, ipfsUri }. Requires PINATA_JWT and PINATA_GATEWAY env vars.">
              <Param name="policy" type="VCRPolicy" desc="Validated policy to pin" />
            </FnCard>
            <FnCard name="fetchPolicy" signature="(cidOrUri) → Promise<VCRPolicy>" description="Fetches and validates a VCR policy from IPFS. Accepts ipfs:// URI or raw CID.">
              <Param name="cidOrUri" type="string" desc="IPFS URI or raw CID" />
            </FnCard>
            <FnCard name="extractPolicyCid" signature="(cidOrUri) → string" description="Strips ipfs:// prefix or extracts CID from gateway URL." />
            <FnCard name="serializePolicy" signature="(policy) → string" description="Returns the deterministic JSON string of a policy." />
            <FnCard name="computePolicyHash" signature="(policy) → string" description="Returns keccak256 hash of the deterministically-serialized policy." />
          </DocSection>

          {/* ── Verifier Module ── */}
          <DocSection id="verifier" title="Core Verifier" badge="verifier.ts" badgeColor="var(--nb-error)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>The heart of VCR — checks all policy constraints against a proposed spend request.</p>
            <FnCard name="canAgentSpend" signature="(ensName, req, getDailySpent) → Promise<SpendResult>" description="Full verification: fetches policy from ENS → IPFS, then checks all 7+ constraints (expiry, max tx, recipient, token, chain, slippage, time, daily limit).">
              <Param name="ensName" type="string" desc='Agent ENS name (e.g. "myagent.eth")' />
              <Param name="req" type="SpendRequest" desc="{ amount, token, recipient, chain, slippageBps? }" />
              <Param name="getDailySpent" type="DailySpentGetter" desc="Async fn returning cumulative daily spend in base units" />
            </FnCard>
            <FnCard name="canAgentSpendWithPolicy" signature="(policy, req, dailySpent) → SpendResult" description="Same constraint checks but uses a pre-fetched policy (skips ENS + IPFS). Useful for testing or cached policies.">
              <Param name="policy" type="VCRPolicy" desc="Pre-fetched policy object" />
              <Param name="req" type="SpendRequest" desc="Spend request to validate" />
              <Param name="dailySpent" type="string" desc="Current daily spent in base units" />
            </FnCard>
          </DocSection>

          {/* ── Policy Resolution ── */}
          <DocSection id="agent" title="Agent Lifecycle" badge="createAgent.ts" badgeColor="var(--nb-ok)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>One-shot orchestrator that wires together every step of agent creation: BitGo wallet → ERC-8004 registration → policy pinning → Fileverse storage → ENS binding → EIP-712 wallet link.</p>
            <FnCard name="createAgent" signature="(config, env, options?) → Promise<AgentRecord>" description="Creates a fully-configured VCR agent from scratch. Returns an AgentRecord with all identifiers.">
              <Param name="config" type="CreateAgentConfig" desc="name, baseDomain, maxPerTxUsdc, dailyLimitUsdc, allowedRecipients, etc." />
              <Param name="env" type="object" desc="Credential keys: BITGO_ACCESS_TOKEN, BITGO_ENTERPRISE_ID, PINATA_JWT, PINATA_GATEWAY, PIMLICO_API_KEY, PRIVATE_KEY, SEPOLIA_RPC_URL" />
              <Param name="options" type="{ logger?, skipEnsBinding? }" desc="Optional progress logger and ENS skip flag" />
            </FnCard>
            <FnCard name="updateAgentPolicy" signature="(config) → Promise<AgentRecord>" description="Updates an existing agent's VCR policy — pins new version to IPFS, updates Fileverse, and re-binds ENS." />

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', textTransform: 'uppercase', marginTop: 32, marginBottom: 16 }}>Spend Tracking</h3>
            <FnCard name="getDailySpent" signature="(ensName, token) → Promise<string>" description="Returns the cumulative amount spent today (UTC) for the given agent + token." />
            <FnCard name="recordSpend" signature="(ensName, token, amount) → void" description="Records a spend event for daily tracking." />
            <FnCard name="getSpendSummary" signature="(ensName, policy) → SpendSummary" description="Returns a summary including dailySpent, remainingToday, percentUsed, and resetsAt." />
            <FnCard name="resetDailySpend / clearAllSpendData" signature="() → void" description="Reset daily spend counters. Useful for testing." />

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', textTransform: 'uppercase', marginTop: 32, marginBottom: 16 }}>Policy Resolution (Cached)</h3>
            <FnCard name="resolveAgentPolicy" signature="(ensName) → Promise<VCRPolicy>" description="Resolves ENS → IPFS with caching. Returns the full VCRPolicy object." />
            <FnCard name="invalidatePolicyCache / clearPolicyCache" signature="(ensName?) → void" description="Invalidate a single entry or clear the entire policy cache." />

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', textTransform: 'uppercase', marginTop: 32, marginBottom: 16 }}>Policy Integrity</h3>
            <FnCard name="verifyPolicyIntegrity" signature="(walletId, policyDoc) → Promise<IntegrityResult>" description="Compares the live BitGo wallet policy hash against the on-chain commitment in the VCR policy document. Returns { match, onChainHash, liveHash, driftedFields? }." />
          </DocSection>

          {/* ── ENS ── */}
          <DocSection id="ens" title="ENS Integration" badge="ens.ts" badgeColor="var(--nb-ok)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>ENSIP-25 agent registration records and VCR policy text records. Supports both platform subdomain and user-root ENS modes.</p>
            <FnCard name="setVCRPolicyRecord" signature="(ensName, policyUri) → Promise<ENSSetResult>" description="Sets the vcr.policy ENS text record to an IPFS URI." />
            <FnCard name="setAgentRegistrationRecord" signature="(ensName, agentId) → Promise<ENSSetResult>" description="Sets the ENSIP-25 agent-registration text record." />
            <FnCard name="setAllENSRecords" signature="(ensName, agentId, policyUri) → Promise<ENSSetResult>" description="Sets both agent-registration and vcr.policy in a single multicall transaction." />
            <FnCard name="provisionAgentENSBinding" signature="(ensName, agentId, policyUri, ...) → Promise<ENSSetResult>" description="Full ENS provisioning: resolves config, sets text records, and optionally sets contenthash." />
            <FnCard name="getVCRPolicyUri" signature="(ensName) → Promise<string | null>" description="Reads the vcr.policy text record from ENS." />
            <FnCard name="verifyAgentENSLink" signature="(ensName, agentId, ...) → Promise<LinkVerificationResult>" description="Verifies both the ERC-8004 registry ownership AND the ENS text record match." />
            <FnCard name="encodeERC7930" signature="(chainId, address) → string" description="Encodes a chain + address into ERC-7930 format for ENSIP-25 text record keys." />
            <FnCard name="buildAgentRegistrationKey" signature="(chainId, registryAddress, agentId) → string" description='Builds the full ENSIP-25 text record key: agent-registration[<ERC7930>][<agentId>]' />
          </DocSection>

          {/* ── ERC-8004 ── */}
          <DocSection id="erc8004" title="ERC-8004 Identity" badge="erc8004.ts" badgeColor="var(--nb-accent2)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>On-chain agent registration, metadata, reputation, and wallet linking via the ERC-8004 IdentityRegistry.</p>
            <FnCard name="registerAgent" signature="(agentUri?) → Promise<RegistrationResult>" description="Registers a new agent on the ERC-8004 IdentityRegistry. Agent IDs start from 0." />
            <FnCard name="waitForAgentRegistration" signature="(txHash) → Promise<{ agentId, txHash }>" description="Waits for the registration transaction receipt and extracts the agentId from the AgentRegistered event." />
            <FnCard name="setAgentURI" signature="(agentId, uri) → Promise<string>" description="Sets the agentURI (IPFS-hosted metadata JSON) for a registered agent." />
            <FnCard name="setAgentWallet" signature="(agentId, wallet, bitgoWallet, passphrase) → Promise<string>" description="Links a BitGo wallet address to the agent via EIP-712 typed signature." />
            <FnCard name="getAgentReputation" signature="(agentId) → Promise<ReputationSummary>" description="Reads aggregate reputation from the ReputationRegistry." />
            <FnCard name="buildAgentMetadataJson" signature="(meta, registry, agentId, chainId) → AgentMetadata" description="Builds the ERC-8004 registration JSON with registrations array and services." />
            <FnCard name="verifyERC8004Registration" signature="(agentId, ensName?) → Promise<ERC8004VerificationResult>" description="Verifies that an agent is registered, checks URI, matching ENS endpoint, and registration metadata." />
          </DocSection>

          {/* ── BitGo ── */}
          <DocSection id="bitgo" title="BitGo Wallet Management" badge="bitgo.ts" badgeColor="var(--nb-warn)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>Institutional-grade wallet infrastructure. BitGo policies serve as on-chain enforcement, VCR policies as off-chain intent verification.</p>
            <div style={{ background: 'var(--nb-error)', color: '#fff', padding: '14px 18px', border: '3px solid var(--nb-ink)', boxShadow: '4px 4px 0 var(--nb-ink)', marginBottom: 20, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700 }}>
              ⚠ CRITICAL: All BitGo wallet policies lock 48 hours after creation and become immutable forever. Plan policies carefully!
            </div>
            <FnCard name="createAgentWallet" signature="(label, passphrase, recipients, dailyLimitWei, maxPerTxWei, isTestnet?) → Promise<BitGoWalletResult>" description="Creates a v3 onchain-multisig wallet with velocity and whitelist policies. Returns walletId, forwarderAddress, userKeyPrv (one-time!), policyHash." />
            <FnCard name="getWallet" signature="(walletId) → Promise<Wallet>" description="Fetches wallet details by ID." />
            <FnCard name="sendTransaction" signature="(walletId, recipients, passphrase) → Promise<SendResult>" description="Sends a transaction. Returns txid (if approved) or pendingApproval (if policy-triggered)." />
            <FnCard name="setWalletPolicy / getWalletPolicy" signature="(walletId, policy) → Promise" description="Get or set wallet-level policies (whitelist, velocity, allocation limits). Remember: amounts are in WEI!" />
            <FnCard name="unlockBitGoSession" signature="(otp?) → Promise<void>" description="Unlocks the BitGo session. Test OTP is 0000000 (7 zeroes)." />
            <FnCard name="approvePendingApproval / rejectPendingApproval" signature="(approvalId, otp?) → Promise" description="Handle pending approval workflow when a transaction triggers a policy." />
          </DocSection>

          {/* ── x402 ── */}
          <DocSection id="x402" title="x402 Payment Protocol" badge="x402.ts" badgeColor="var(--nb-accent2)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>HTTP 402-based crypto payment rails. VCR integrates as a pre-flight check before signing any EIP-3009 payment authorization.</p>
            <FnCard name="vcrPaymentMiddleware" signature="(options) → Express Middleware" description="Express middleware gating a route behind x402 payment. Optionally runs VCR canAgentSpend() check.">
              <Param name="options.amount" type="string" desc='Price in base units (e.g. "100000" = $0.10 USDC)' />
              <Param name="options.token" type="string" desc="Token symbol" />
              <Param name="options.network" type="string" desc="Network identifier" />
              <Param name="options.recipient" type="string" desc="Payment recipient address" />
              <Param name="options.vcrCheck" type="{ getDailySpent }" desc="Optional VCR policy verification" />
            </FnCard>
            <FnCard name="fetchWithVCRPayment" signature="(input, init, options) → Promise<Response>" description="Client-side fetch wrapper. Automatically handles 402 → sign → retry flow with VCR pre-flight." />
            <FnCard name="createSignedPaymentRequest" signature="(requirement, options) → Promise<X402SignedRequest>" description="Creates a signed x402 payment request. Runs canAgentSpend() before signing." />
            <FnCard name="buildEIP3009TypedData" signature="(params) → TypedData" description="Builds EIP-3009 TransferWithAuthorization typed data for USDC payments." />
            <FnCard name="parsePaymentRequired" signature="(response) → X402PaymentRequirement | null" description="Extracts PAYMENT-REQUIRED header from a 402 response." />
            <CodeBlock title="x402 V2 header constants">{`X402_HEADERS = {
  PAYMENT_REQUIRED:  'PAYMENT-REQUIRED',   // Server → Client (402)
  PAYMENT_SIGNATURE: 'PAYMENT-SIGNATURE',  // Client → Server (retry)
  PAYMENT_RESPONSE:  'PAYMENT-RESPONSE',   // Server → Client (200)
}
// No X- prefix in V2. Old X-PAYMENT format is deprecated.`}</CodeBlock>
          </DocSection>

          {/* ── On-Chain Registry ── */}
          <DocSection id="contract" title="On-Chain VCR Registry" badge="contract.ts" badgeColor="var(--nb-error)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>On-chain policy commitment — stores policy CID hashes on the VCRPolicyRegistry contract for immutable verification.</p>
            <FnCard name="setPolicyOnChain" signature="(agentId, policyCid) → Promise<SetPolicyOnChainResult>" description="Commits a policy CID to the on-chain registry." />
            <FnCard name="revokePolicyOnChain" signature="(agentId) → Promise<string>" description="Revokes the on-chain policy for an agent." />
            <FnCard name="getPolicyOnChain" signature="(agentId) → Promise<OnChainPolicyRecord>" description="Reads the current on-chain policy record." />
            <FnCard name="verifyPolicyOnChain" signature="(agentId, expectedCid) → Promise<boolean>" description="Checks if the on-chain CID matches the expected value." />
            <FnCard name="getTotalPoliciesOnChain / getPolicyHistoryCount" signature="() → Promise<number>" description="Returns total policy count or history length for a specific agent." />
          </DocSection>

          {/* ── Types ── */}
          <DocSection id="types" title="Type Definitions" badge="types.ts" badgeColor="var(--nb-accent)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>All TypeScript interfaces exported from the SDK. Import from <code style={{ fontFamily: 'var(--font-mono)' }}>@shaurya2k06/vcrsdk</code> or <code style={{ fontFamily: 'var(--font-mono)' }}>@shaurya2k06/vcrsdk/types</code>.</p>
            <TypeBlock>{`// ── Policy Schema ──
interface VCRPolicy {
  version: '1.0';
  agentId: string;            // eip155:<chainId>:<registry>:<id>
  constraints: VCRConstraints;
  metadata: PolicyMetadata;
  ensName?: string;
  walletAddress?: string;
  custodian?: string;
  network?: string;
  policy_hash?: string;
  ipfs_cid?: string;
  enforcement?: { vcr_layer: boolean; bitgo_native_policies: boolean; reason?: string };
}

interface VCRConstraints {
  maxTransaction: TokenAmount;    // { amount, token, chain }
  dailyLimit: TokenAmount;
  allowedRecipients: string[];
  allowedTokens: string[];
  allowedChains: string[];
  timeRestrictions?: { timezone: 'UTC'; allowedHours: [number, number] };
  slippageProtection?: { enabled: boolean; maxSlippageBps: number };
}

// ── Spend Verification ──
interface SpendRequest { amount: string; token: string; recipient: string; chain: string; slippageBps?: number }
interface SpendResult  { allowed: boolean; reason?: string; policy?: VCRPolicy; policyCid?: string; dailySpentAtCheck?: string }

// ── Agent Lifecycle ──
interface CreateAgentConfig {
  name: string; baseDomain: string; ensMode?: 'platform-subdomain' | 'user-root';
  maxPerTxUsdc: string; dailyLimitUsdc: string; allowedRecipients: string[];
  allowedTokens?: string[]; allowedChains?: string[]; allowedHours?: [number, number];
}

interface AgentRecord {
  ensName: string; walletId: string; walletAddress: string; agentId: number;
  policyCid: string; policyUri: string; policyHash: string;
  registrationTx: string; ensTx: string; createdAt: string;
}

// ── BitGo ──
interface BitGoWalletResult { walletId: string; forwarderAddress: string; userKeyPrv: string; policyHash: string }
interface BitGoPolicy { advancedWhitelist?: string[]; velocityLimit?: { amount: string; timeWindow: number } }

// ── x402 ──
interface X402PaymentRequirement { price: string; token: string; network: string; recipient: string; facilitator: string }
interface X402SignedRequest { scheme: 'exact'; network: string; authorization: X402PaymentAuthorization }

// ── IPFS ──
interface PinResult { cid: string; ipfsUri: string }

// ── Integrity ──
interface IntegrityResult { match: boolean; onChainHash: string; liveHash: string; driftedFields?: string[] }`}</TypeBlock>
          </DocSection>

          {/* ── Constants ── */}
          <DocSection id="constants" title="Constants & Addresses" badge="constants.ts" badgeColor="var(--nb-ink)">
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>All contract addresses and chain IDs are exported as <code style={{ fontFamily: 'var(--font-mono)' }}>CONTRACTS</code> and <code style={{ fontFamily: 'var(--font-mono)' }}>CHAIN_IDS</code>.</p>
            <ContractTable rows={[
              ['ERC-8004 IdentityRegistry', 'Mainnet', '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'],
              ['ERC-8004 IdentityRegistry', 'Sepolia', '0x8004A818BFB912233c491871b3d84c89A494BD9e'],
              ['ERC-8004 ReputationRegistry', 'Mainnet', '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'],
              ['ERC-8004 ReputationRegistry', 'Sepolia', '0x8004B663056A597Dffe9eCcC1965A193B7388713'],
              ['ENS Registry', 'All', '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'],
              ['ENS Universal Resolver', 'All', '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'],
              ['ENS Public Resolver', 'Mainnet', '0xF29100983E058B709F3D539b0c765937B804AC15'],
              ['ENS Public Resolver', 'Sepolia', '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'],
              ['x402 Facilitator', 'Base', 'https://x402.org/facilitator'],
              ['BitGo Test API', 'Test', 'https://app.bitgo-test.com'],
            ]} />
            <CodeBlock title="chain IDs">{`CHAIN_IDS = {
  mainnet:     1,
  sepolia:     11155111,
  hoodi:       560048,      // BitGo testnet (replaces Holesky)
  base:        8453,
  baseSepolia: 84532,
}`}</CodeBlock>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', textTransform: 'uppercase', marginTop: 32, marginBottom: 16 }}>Environment Variables</h3>
            <CodeBlock title=".env template">{`# BitGo
BITGO_ACCESS_TOKEN=v2x...
BITGO_ENTERPRISE_ID=...
BITGO_WALLET_PASSPHRASE=...

# Pinata (IPFS)
PINATA_JWT=...
PINATA_GATEWAY=your-gateway.mypinata.cloud

# Pimlico (Account Abstraction)
PIMLICO_API_KEY=...

# Wallet & RPC
PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...

# ENS
ENS_NAME=youragent.eth`}</CodeBlock>
          </DocSection>

          {/* ── Footer ── */}
          <div style={{ borderTop: '3px solid var(--nb-ink)', paddingTop: 32, marginTop: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', fontSize: '1.2rem' }}>VCR Protocol SDK</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#9ca3af', marginTop: 4 }}>v1.1.0 · MIT License · March 2026</div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <a href="https://www.npmjs.com/package/@shaurya2k06/vcrsdk" target="_blank" rel="noreferrer" className="nb-btn" style={{ fontSize: '0.85rem', padding: '10px 20px' }}>npm</a>
              <a href="https://github.com/Shaurya2k06/VCR-Protocol" target="_blank" rel="noreferrer" className="nb-btn nb-btn--primary" style={{ fontSize: '0.85rem', padding: '10px 20px' }}>GitHub</a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
