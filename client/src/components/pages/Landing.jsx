import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";

const FEATURES = [
  {
    icon: "🕵️",
    title: "ERC-8004 Identity",
    desc: "Autonomous agents get on-chain identity via the IdentityRegistry, enabling trustless agent discovery.",
    badge: "Identity Layer",
    badgeClass: "badge-purple",
  },
  {
    icon: "📜",
    title: "VCR Policy",
    desc: "JSON spending policies pinned to IPFS and anchored via ENS — verifiable by anyone, owned by no one.",
    badge: "Policy Layer",
    badgeClass: "badge-blue",
  },
  {
    icon: "🔗",
    title: "ENSIP-25 Linking",
    desc: "Bidirectional agent-ENS links via ERC-7930-encoded text record keys. One-line testnet swap.",
    badge: "ENS Layer",
    badgeClass: "badge-amber",
  },
  {
    icon: "💸",
    title: "x402 Payments",
    desc: "HTTP 402 payment rails secured by EIP-3009 USDC signatures. The missing internet money protocol.",
    badge: "Payment Layer",
    badgeClass: "badge-green",
  },
  {
    icon: "🏦",
    title: "BitGo Enforcement",
    desc: "On-chain wallet policies (velocity limits, address whitelists) mirror the VCR policy as hard enforcement.",
    badge: "Enforcement Layer",
    badgeClass: "badge-red",
  },
  {
    icon: "✅",
    title: "canAgentSpend()",
    desc: "Nine constraint checks in one call — amount, recipient, token, chain, time, daily limit. Any service can verify.",
    badge: "Verifier",
    badgeClass: "badge-green",
  },
];

const FLOW_STEPS = [
  { label: "Agent Owner", icon: "👤", color: "var(--neon-purple)" },
  { label: "VCR Policy JSON", icon: "📄", color: "var(--neon-blue)" },
  { label: "IPFS (Pinata)", icon: "🗂️", color: "var(--neon-amber)" },
  { label: "ENS vcr.policy", icon: "🔗", color: "var(--neon-blue)" },
  { label: "ERC-8004 Registry", icon: "📋", color: "var(--neon-purple)" },
  { label: "x402 Paywall", icon: "🚧", color: "var(--neon-red)" },
  { label: "canAgentSpend()", icon: "✅", color: "var(--neon-green)" },
  { label: "Payment Settled", icon: "💰", color: "var(--text-muted)" },
];

export default function Landing() {
  const canvasRef = useRef(null);

  // Animated particle grid background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const cols = 16;
      const rows = 8;
      const dx = w / cols;
      const dy = h / rows;

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const px = i * dx;
          const py = j * dy;
          const wave = Math.sin(t * 0.02 + i * 0.4 + j * 0.4) * 0.5 + 0.5;
          const alpha = wave * 0.18 + 0.04;
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(99, 210, 255, ${alpha})`;
          ctx.fill();
        }
      }

      t++;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        />

        {/* Radial glow */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(99,210,255,0.07) 0%, transparent 70%)",
        }} />

        <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "120px 24px 80px" }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="badge badge-blue">v1.0 · Sepolia Testnet</span>
            <span className="badge badge-purple">ENSIP-25 · ERC-8004 · x402</span>
          </div>

          <h1 style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)", lineHeight: 1.05, marginBottom: "24px", letterSpacing: "-0.04em" }}>
            Policy-Bound<br />
            <span className="text-gradient">Agent Wallets</span>
          </h1>

          <p style={{ fontSize: "clamp(1rem, 2.5vw, 1.25rem)", color: "var(--text-secondary)", maxWidth: 620, margin: "0 auto 40px", lineHeight: 1.7 }}>
            The missing layer between ERC-8004 identity, ENS names, and x402 payment rails.
            VCR lets you define, publish, and verify spending constraints for autonomous agents.
          </p>

          <div className="flex justify-center gap-3 flex-wrap">
            <Link to="/build" className="btn btn-primary btn-lg">Build a Policy →</Link>
            <Link to="/demo" className="btn btn-outline btn-lg">x402 Live Demo</Link>
          </div>

          {/* Arch preview */}
          <div className="card" style={{ marginTop: 64, textAlign: "left", maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            <p className="text-muted mono" style={{ fontSize: "0.78rem", marginBottom: 12 }}>// Architecture flow</p>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", lineHeight: 2, color: "var(--text-secondary)" }}>
              <div><span className="text-purple">Agent Owner</span> → defines <span className="text-neon">VCR Policy JSON</span> → pins to <span className="text-amber">IPFS</span> → gets CID</div>
              <div><span className="text-purple">Agent Owner</span> → sets ENS text record <span className="text-neon">vcr.policy</span> = ipfs://&lt;CID&gt;</div>
              <div><span className="text-purple">Agent Owner</span> → registers agent on <span className="text-neon">ERC-8004 IdentityRegistry</span></div>
              <div style={{ height: 8 }} />
              <div><span className="text-amber">Service</span> ← receives <span className="text-red">x402</span> payment request from agent</div>
              <div><span className="text-amber">Service</span> → reads ENS → fetches vcr.policy → runs</div>
              <div style={{ paddingLeft: 24 }}>
                <span className="text-green">canAgentSpend()</span>
              </div>
              <div style={{ paddingLeft: 48, color: "var(--neon-green)", fontSize: "0.75rem" }}>
                ✓ amount ≤ maxTransaction &nbsp; ✓ recipient whitelisted<br />
                ✓ cumulative ≤ dailyLimit &nbsp;&nbsp; ✓ token + chain allowed<br />
                ✓ within allowedHours
              </div>
              <div style={{ marginTop: 8 }}>
                If ALL pass → allow <span className="text-green">x402 payment</span> to proceed
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 0", background: "linear-gradient(180deg, var(--bg-base), var(--bg-surface))" }}>
        <div className="container">
          <div className="page-header">
            <h2>Everything Between Identity & Payment</h2>
            <p>Six protocol layers wired together into one coherent SDK</p>
          </div>

          <div className="grid-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card" style={{ cursor: "default" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>{f.icon}</div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 style={{ fontSize: "1rem" }}>{f.title}</h3>
                  <span className={`badge ${f.badgeClass}`}>{f.badge}</span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow Diagram ──────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 0" }}>
        <div className="container">
          <div className="page-header">
            <h2>How It Works</h2>
            <p>From policy creation to payment verification — 8 steps</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", alignItems: "center" }}>
            {FLOW_STEPS.map((step, i) => (
              <>
                <div key={step.label} className="card" style={{
                  textAlign: "center", padding: "16px 20px", minWidth: 130,
                  borderColor: `${step.color}30`,
                }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>{step.icon}</div>
                  <div style={{ fontSize: "0.75rem", color: step.color, fontFamily: "var(--font-display)", fontWeight: 600 }}>{step.label}</div>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div key={`arr-${i}`} style={{ color: "var(--text-muted)", fontSize: "1.2rem", flexShrink: 0 }}>→</div>
                )}
              </>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 0 120px", textAlign: "center" }}>
        <div className="container">
          <div className="card" style={{ maxWidth: 640, margin: "0 auto", background: "linear-gradient(135deg, rgba(99,210,255,0.05), rgba(167,139,250,0.05))", borderColor: "rgba(99,210,255,0.2)" }}>
            <h2 style={{ marginBottom: 12 }}>Start Building on Testnet</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
              Fully deployable on Sepolia + Base Sepolia. No real ETH required.
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              <Link to="/register" className="btn btn-primary">Register Agent</Link>
              <Link to="/verify" className="btn btn-outline">Verify Spend</Link>
              <Link to="/explorer" className="btn btn-ghost">Policy Explorer</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
