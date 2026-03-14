import { useState, useRef } from 'react';

/* ================================================================== */
/*  Feature Showcase — Interactive category-based feature explorer      */
/*  VCR Protocol Features                                               */
/* ================================================================== */

const CATS = [
  { key: 'all',      label: 'All Features',     color: '#111827', icon: '*' }, /* nb-ink */
  { key: 'identity', label: 'Identity & Access', color: '#3B82F6', icon: 'ID' }, /* nb-accent */
  { key: 'security', label: 'Security & Policy', color: '#EF4444', icon: 'SEC' }, /* nb-error */
  { key: 'execution',label: 'Execution & Pay',   color: '#10B981', icon: 'EXE' }, /* nb-ok */
];

const FEATURES = [
  {
    icon: 'ID', title: 'ERC-8004 Identity', category: 'identity', color: '#3B82F6',
    desc: 'Exposes the agent\'s identity and its controlling smart contract securely via the `owner()` method.',
    detail: 'Standardizes how an autonomous agent, running off-chain, is mathematically linked to an on-chain Smart Contract wallet representation.',
  },
  {
    icon: 'NS', title: 'ENSIP-25 Linking', category: 'identity', color: '#8B5CF6',
    desc: 'Links multi-chain addresses through ENS subnames, establishing verified ownership.',
    detail: 'Resolves complex 0x addresses into human/machine readable names (e.g., trading-bot.vcr.eth) across all supported EVM networks.',
  },
  {
    icon: '42', title: 'x402 Payments', category: 'execution', color: '#F59E0B',
    desc: 'Supports HTTP-402 Payment Required headers natively, allowing agents to pay for APIs.',
    detail: 'The agent SDK intercepts 402 HTTP status codes, reads the L402 macaroon, and dispatches a micro-transaction to fulfill the API cost autonomously.',
  },
  {
    icon: 'BG', title: 'BitGo Enforcement', category: 'execution', color: '#10B981',
    desc: 'Enforces final constraints via MPC or heavily restricted session keys before dispatch.',
    detail: 'Even if the underlying server infrastructure is compromised, BitGo MPC policies guarantee that funds cannot leave the wallet unless the VCR attestation is present.',
  },
  {
    icon: 'FV', title: 'Fileverse Policies', category: 'security', color: '#EF4444',
    desc: 'Stores spending constraints inside Fileverse portals with deterministic CIDs.',
    detail: 'Policies are stored on decentralized Storage. If a single byte of the policy changes, the CID changes, instantly invalidating the Smart Contract pointer and halting execution.',
  },
  {
    icon: '0G', title: 'Off-chain Validation', category: 'security', color: '#111827',
    desc: 'The `canAgentSpend()` endpoint runs deterministic checks with zero gas overhead.',
    detail: 'Saves thousands of dollars in gas fees by moving the heavy constraint evaluation loop (allowlists, rate limits, budget calculations) completely off-chain while maintaining mathematically sound proofs.',
  },
];

export default function FeatureShowcase() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const gridRef = useRef(null);

  const filtered = activeCategory === 'all'
    ? FEATURES
    : FEATURES.filter((f) => f.category === activeCategory);

  // count per category for the radar
  const counts = {
    all: FEATURES.length,
    identity: FEATURES.filter((f) => f.category === 'identity').length,
    security: FEATURES.filter((f) => f.category === 'security').length,
    execution: FEATURES.filter((f) => f.category === 'execution').length,
  };

  return (
    <div>
      {/* ---- Category tabs ---- */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
        {CATS.map((cat) => {
          const active = cat.key === activeCategory;
          return (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setExpandedIdx(null); }}
              style={{
                padding: '12px 24px',
                border: `3px solid ${active ? cat.color : 'var(--nb-ink)'}`,
                boxShadow: active ? `4px 4px 0 ${cat.color}` : '3px 3px 0 var(--nb-ink)',
                background: active ? cat.color : '#FFFFFF',
                color: active ? '#FFFFFF' : 'var(--nb-ink)',
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
                transform: active ? 'translate(-2px, -2px)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                style={{
                  marginLeft: 8,
                  padding: '2px 8px',
                  fontSize: '0.7rem',
                  border: `2px solid ${active ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.15)'}`,
                }}
              >
                {counts[cat.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- Feature grid ---- */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 24,
        }}
      >
        {filtered.map((f, i) => {
          const isExpanded = expandedIdx === i;
          const isHovered = hoveredIdx === i;
          
          const borderColor = isExpanded ? f.color : isHovered ? f.color : 'var(--nb-ink)';
          const shadowColor = isExpanded ? f.color : isHovered ? 'var(--nb-ink)' : 'var(--nb-ink)';
          const shadowSize = isExpanded ? '6px' : isHovered ? '6px' : '4px';

          return (
            <div
              key={f.title}
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                background: '#FFFFFF',
                border: `3px solid ${borderColor}`,
                boxShadow: `${shadowSize} ${shadowSize} 0 ${shadowColor}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                transform: (isHovered && !isExpanded) ? 'translate(-2px, -2px)' : 'none',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {/* Top Accent Bar */}
              <div style={{ height: 6, background: f.color, transition: 'height 0.2s', ...(isExpanded && { height: 8 }) }} />

              <div style={{ padding: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `3px solid ${f.color}`, background: `${f.color}15`, fontSize: '1.2rem', fontWeight: 800, color: f.color
                    }}>
                      {f.icon}
                    </div>
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>{f.title}</h3>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', fontWeight: 700, color: f.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
                        {CATS.find(c => c.key === f.category)?.label}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '1.5rem', fontWeight: 700, color: f.color, transform: isExpanded ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>
                    +
                  </div>
                </div>

                {/* Short Description */}
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--nb-ink)', lineHeight: 1.6, marginTop: '20px', marginBottom: 0 }}>
                  {f.desc}
                </p>

                {/* Expanded Tech Detail */}
                {isExpanded && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: `2px dashed ${f.color}50` }}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: f.color, marginBottom: 8 }}>
                      // Tech Specs
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--nb-ink)', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>
                      {f.detail}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
