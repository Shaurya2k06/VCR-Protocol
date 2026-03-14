import React from 'react';
import { Link } from 'react-router-dom';
import ArchitectureFlow from '../ArchitectureFlow';
import FeatureShowcase from '../FeatureShowcase';

/* ================================================================== */
/*  VCR Protocol — Landing Page                                       */
/*  Neo-Brutalist Reversion with Interactive Components               */
/* ================================================================== */

function Section({ id, children, bg = 'transparent', borderTop = false }) {
  return (
    <section
      id={id}
      style={{
        padding: '120px 0',
        background: bg,
        borderTop: borderTop ? 'var(--nb-border)' : 'none',
        color: bg === 'var(--nb-ink)' ? 'var(--nb-bg)' : 'var(--nb-ink)'
      }}
    >
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        {children}
      </div>
    </section>
  );
}

function SectionLabel({ children, dark = false }) {
  const color = dark ? 'var(--nb-bg)' : 'var(--nb-accent)';
  const border = dark ? 'var(--nb-bg)' : 'var(--nb-ink)';
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ 
        width: '20px', height: '20px', 
        background: color, 
        border: `3px solid ${border}`,
        boxShadow: `3px 3px 0 ${dark ? 'rgba(255,255,255,0.2)' : 'var(--nb-accent)'}`
      }} />
      <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: color }}>
        [{children}]
      </span>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ maxWidth: '700px' }}>
      <h2 style={{ fontSize: '3rem', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '-0.04em' }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: '1.25rem', opacity: 0.9, fontFamily: 'var(--font-mono)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function TechBadge({ children, color = 'var(--nb-ink)' }) {
  return (
    <span 
      className="nb-badge" 
      style={{ 
        color: color,
        borderColor: color,
        boxShadow: `3px 3px 0 ${color}`
      }}
    >
      {children}
    </span>
  );
}

export default function Landing() {
  return (
    <div style={{ background: 'var(--nb-bg)', color: 'var(--nb-ink)', minHeight: '100vh', position: 'relative' }}>
      
      {/* Absolute grid overlay */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'linear-gradient(var(--nb-ink) 1px, transparent 1px), linear-gradient(90deg, var(--nb-ink) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.03,
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* --- NAVBAR --- */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '80px',
        background: 'var(--nb-bg)',
        borderBottom: 'var(--nb-border)',
        zIndex: 100,
        display: 'flex', alignItems: 'center'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              width: '40px', height: '40px', 
              background: 'var(--nb-accent)', color: 'var(--nb-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontFamily: 'var(--font-display)', fontSize: '1.5rem',
              border: '3px solid var(--nb-ink)',
              boxShadow: '3px 3px 0 var(--nb-ink)'
            }}>
              V
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              VCR Protocol
            </span>
          </div>
          
          <nav style={{ display: 'flex', gap: '32px', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
            <a href="#how-it-works" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>Architecture</a>
            <a href="#features" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>Features</a>
            <a href="#security" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>Security</a>
            <Link to="/register" className="nb-btn nb-btn--primary" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
              Initialization
            </Link>
          </nav>
        </div>
      </header>

      {/* --- HERO --- */}
      <section style={{
        padding: '200px 0 100px',
        position: 'relative',
        zIndex: 1
      }}>
        <div className="container" style={{ position: 'relative' }}>
          <div style={{ maxWidth: '900px' }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
              <TechBadge color="var(--nb-ok)">SYS.ERC-8004</TechBadge>
              <TechBadge color="var(--nb-accent)">SYS.ENSIP-25</TechBadge>
              <TechBadge color="var(--nb-accent2)">SYS.x402</TechBadge>
            </div>
            
            <h1 style={{ 
              fontSize: 'clamp(3.5rem, 8vw, 6.5rem)', 
              lineHeight: 0.95, 
              marginBottom: '32px',
              textTransform: 'uppercase',
              color: 'var(--nb-ink)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.04em'
            }}>
              Policy-Bound <br/>
              <span style={{ 
                color: 'var(--nb-bg)',
                background: 'var(--nb-accent)', 
                padding: '0 16px', 
                display: 'inline-block',
                transform: 'rotate(-2deg)',
                border: '4px solid var(--nb-ink)',
                boxShadow: '8px 8px 0 var(--nb-ink)',
                marginTop: '16px'
              }}>
                Agent Wallets.
              </span>
            </h1>
            
            <p className="mono" style={{ 
              fontSize: '1.25rem', 
              maxWidth: '650px', 
              marginBottom: '48px',
              fontWeight: 400,
              color: 'var(--nb-ink)',
              borderLeft: '4px solid var(--nb-accent)',
              paddingLeft: '24px'
            }}>
              The Verifiable Computation Registry (VCR) enforces off-chain agent spending policies via cryptographic attestations. Making autonomous agents safe to transact.
            </p>
            
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <Link to="/register" className="nb-btn nb-btn--primary" style={{ fontSize: '1.2rem', padding: '18px 36px' }}>
                Launch Demo
              </Link>
              <button className="nb-btn" style={{ fontSize: '1.2rem', padding: '18px 36px', background: '#FFFFFF' }}>
                Read Documentation
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* --- STAT STRIP --- */}
      <div style={{ borderTop: 'var(--nb-border)', borderBottom: 'var(--nb-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', position: 'relative', zIndex: 1, background: '#FFFFFF' }}>
        <div style={{ padding: '48px 32px', borderRight: 'var(--nb-border)' }}>
          <div className="mono" style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--nb-accent)', textShadow: '4px 4px 0 var(--nb-ink)' }}>100%</div>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', color: 'var(--nb-ink)', marginTop: '8px' }}>Deterministic Policy</div>
        </div>
        <div style={{ padding: '48px 32px', borderRight: 'var(--nb-border)' }}>
          <div className="mono" style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--nb-error)', textShadow: '4px 4px 0 var(--nb-ink)' }}>0 GAS</div>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', color: 'var(--nb-ink)', marginTop: '8px' }}>For Policy Checks</div>
        </div>
        <div style={{ padding: '48px 32px', borderRight: 'var(--nb-border)' }}>
          <div className="mono" style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--nb-ok)', textShadow: '4px 4px 0 var(--nb-ink)' }}>&gt;48H</div>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', color: 'var(--nb-ink)', marginTop: '8px' }}>Immutable IPFS Pinning</div>
        </div>
        <div style={{ padding: '48px 32px' }}>
          <div className="mono" style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--nb-accent2)', textShadow: '4px 4px 0 var(--nb-ink)' }}>1 API</div>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', color: 'var(--nb-ink)', marginTop: '8px' }}>Unified Integration</div>
        </div>
      </div>

      {/* --- HOW IT WORKS (React Flow) --- */}
      <Section id="how-it-works" bg="var(--nb-ink)">
        <div>
          <SectionLabel dark>Architecture Flow</SectionLabel>
          <div style={{ marginTop: '24px' }}>
            <SectionTitle 
              title="The Enforcement Loop" 
              subtitle="Interact with the diagram below to understand how VCR evaluates agent intents against spending policies using off-chain infrastructure."
            />
          </div>
        </div>

        {/* Interactive React Flow Diagram */}
        <ArchitectureFlow />
        
      </Section>

      {/* --- STANDARDS / FEATURES (Interactive Grid) --- */}
      <Section id="features" borderTop>
        <SectionLabel>Core Standards</SectionLabel>
        <SectionTitle 
          title="Engineered for Agents" 
          subtitle="VCR leverages established EIP conventions to ensure maximum interoperability and security for AI Wallets. Explore the features below."
        />

        {/* Interactive Showcase Component */}
        <FeatureShowcase />
        
      </Section>

      {/* --- SECURITY / CONSTRAINTS --- */}
      <Section id="security" bg="var(--nb-ink)">
        <SectionLabel dark>Verification Security</SectionLabel>
        <SectionTitle 
          title="On-Chain Guarantees, Off-Chain Speed" 
          subtitle="VCR uses deterministic proofs to guarantee policy enforcement."
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '48px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: 'var(--nb-bg)', border: '3px solid var(--nb-error)', padding: '24px', boxShadow: '6px 6px 0 var(--nb-error)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', color: 'var(--nb-error)' }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: '1.2rem', background: 'var(--nb-error)', color: 'var(--nb-bg)', padding: '4px 8px' }}>EIP</span>
                <h4 style={{ margin: 0, textTransform: 'uppercase', color: 'var(--nb-error)' }}>EIP-3009 Authorizations</h4>
              </div>
              <p style={{ fontSize: '0.95rem', color: 'var(--nb-ink)', margin: 0 }}>Agents execute payments via <code className="mono">transferWithAuthorization</code> signatures, enabling gasless HTTP 402 handshakes on the x402 protocol without holding native ETH.</p>
            </div>
            
            <div style={{ background: 'var(--nb-bg)', border: '3px solid var(--nb-ok)', padding: '24px', boxShadow: '6px 6px 0 var(--nb-ok)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', color: 'var(--nb-ok)' }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: '1.2rem', background: 'var(--nb-ok)', color: 'var(--nb-bg)', padding: '4px 8px' }}>ENS</span>
                <h4 style={{ margin: 0, textTransform: 'uppercase', color: 'var(--nb-ok)' }}>ENSIP-25 Text Records</h4>
              </div>
              <p style={{ fontSize: '0.95rem', color: 'var(--nb-ink)', margin: 0 }}>VCR links autonomous agents to multi-chain EVM addresses using parameterized <code className="mono">vcr.policy</code> text records mapped to deterministic IPFS CIDs.</p>
            </div>
          </div>
          
          <div style={{ 
            background: '#111827', 
            color: 'var(--nb-bg)',
            padding: '32px',
            border: '3px solid var(--nb-accent)',
            boxShadow: '12px 12px 0 var(--nb-accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            overflowX: 'auto',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--nb-accent)', color: 'var(--nb-bg)', padding: '4px 16px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
              canAgentSpend.ts
            </div>
<pre style={{ margin: 0, marginTop: '24px' }}><code>
<span style={{ color: 'var(--nb-accent2)' }}>// 1. Fetch vcr.policy from ENS text record</span>
<span style={{ color: 'var(--nb-accent)' }}>const</span> policyUri = <span style={{ color: 'var(--nb-accent)' }}>await</span> publicClient.getEnsText({'{'}
  name: normalize(ensName), key: <span style={{ color: 'var(--nb-ok)' }}>'vcr.policy'</span>,
{'}'});
<span style={{ color: 'var(--nb-accent)' }}>if</span> (!policyUri) <span style={{ color: 'var(--nb-error)' }}>return false</span>;

<span style={{ color: 'var(--nb-accent2)' }}>// 2. Fetch deterministic policy JSON from IPFS</span>
<span style={{ color: 'var(--nb-accent)' }}>const</span> policy = <span style={{ color: 'var(--nb-accent)' }}>await</span> fetchFromIPFS(policyUri);

<span style={{ color: 'var(--nb-accent2)' }}>// 3. Evaluate strict spending bounds (in wei)</span>
<span style={{ color: 'var(--nb-accent)' }}>if</span> (BigInt(req.amount) &gt; BigInt(policy.constraints.maxTransaction.amount))
  <span style={{ color: 'var(--nb-error)' }}>return</span> {'{'} allowed: <span style={{ color: 'var(--nb-error)' }}>false</span>, reason: <span style={{ color: 'var(--nb-ok)' }}>'Exceeds max transaction'</span> {'}'};

<span style={{ color: 'var(--nb-accent2)' }}>// 4. Verify cross-chain allowed environments</span>
<span style={{ color: 'var(--nb-accent)' }}>if</span> (!policy.constraints.allowedChains.includes(req.chain))
  <span style={{ color: 'var(--nb-error)' }}>return</span> {'{'} allowed: <span style={{ color: 'var(--nb-error)' }}>false</span>, reason: <span style={{ color: 'var(--nb-ok)' }}>'Chain not allowed'</span> {'}'};

<span style={{ color: 'var(--nb-accent2)' }}>// 5. Allow x402 payment execution via BitGo v3</span>
<span style={{ color: 'var(--nb-ok)' }}>return</span> {'{'} allowed: <span style={{ color: 'var(--nb-ok)' }}>true</span> {'}'};
</code></pre>
          </div>
        </div>
      </Section>

      {/* --- TECH STACK --- */}
      <div style={{ background: 'var(--nb-bg)', color: 'var(--nb-ink)', padding: '64px 0', borderTop: 'var(--nb-border)', borderBottom: 'var(--nb-border)', position: 'relative', zIndex: 1 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>
            Powered By:
          </div>
          <div className="mono" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', fontSize: '1.2rem', fontWeight: 700, color: 'var(--nb-accent)' }}>
            <span>VIEM</span>
            <span>@BITGO</span>
            <span>PINATA</span>
            <span>FILEVERSE</span>
            <span>ENS</span>
          </div>
        </div>
      </div>

      {/* --- FOOTER --- */}
      <footer style={{ padding: '80px 0', background: 'var(--nb-bg)' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '48px' }}>
          <div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, fontFamily: 'var(--font-display)', margin: 0, color: 'var(--nb-ink)', textTransform: 'uppercase', letterSpacing: '-0.04em' }}>VCR Protocol</div>
            <p className="mono" style={{ maxWidth: '400px', fontWeight: 500, marginTop: '24px', color: 'var(--nb-ink)', borderLeft: '4px solid var(--nb-accent)', paddingLeft: '16px' }}>
              The industrial infrastructure layer for secure, deterministic AI agent spending. Built for the machine economy.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '64px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="mono" style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--nb-accent2)', textTransform: 'uppercase', marginBottom: '8px' }}>Resources</div>
              <a href="#" style={{ color: 'var(--nb-ink)', textDecoration: 'none', fontWeight: 700 }}>Documentation</a>
              <a href="#" style={{ color: 'var(--nb-ink)', textDecoration: 'none', fontWeight: 700 }}>GitHub Repo</a>
              <a href="#" style={{ color: 'var(--nb-ink)', textDecoration: 'none', fontWeight: 700 }}>EIP-8004 Specs</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="mono" style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--nb-accent2)', textTransform: 'uppercase', marginBottom: '8px' }}>Network</div>
              <a href="#" style={{ color: 'var(--nb-ink)', textDecoration: 'none', fontWeight: 700 }}>Base Sepolia</a>
              <a href="#" style={{ color: 'var(--nb-ink)', textDecoration: 'none', fontWeight: 700 }}>Mainnet (Soon)</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
