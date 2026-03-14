import { NavLink } from "react-router-dom";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "Home", exact: true },
    { to: "/build", label: "Builder" },
    { to: "/register", label: "Register" },
    { to: "/verify", label: "Verifier" },
    { to: "/demo", label: "Paywall" },
    { to: "/explorer", label: "Explorer" }
  ];

  return (
    <nav style={{ 
      background: "var(--nb-bg)", 
      borderBottom: "4px solid var(--nb-ink)", 
      position: "sticky", 
      top: 0, 
      zIndex: 100,
      padding: "16px 24px"
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <NavLink to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px", color: "var(--nb-ink)" }}>
          <div style={{ 
            background: "var(--nb-accent)", 
            color: "#fff", 
            width: "40px", 
            height: "40px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            fontFamily: "var(--font-display)", 
            fontWeight: 900, 
            fontSize: "1.5rem", 
            border: "3px solid var(--nb-ink)", 
            boxShadow: "3px 3px 0 var(--nb-ink)" 
          }}>V</div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.2rem", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
            VCR Protocol
          </span>
        </NavLink>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.exact}
              style={({ isActive }) => ({
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "0.9rem",
                padding: "8px 16px",
                background: isActive ? "var(--nb-ink)" : "transparent",
                color: isActive ? "var(--nb-bg)" : "var(--nb-ink)",
                border: isActive ? "2px solid var(--nb-ink)" : "2px solid transparent",
                textTransform: "uppercase",
                transition: "all 0.1s"
              })}
            >
              {l.label}
            </NavLink>
          ))}
          
          <a
            href="https://github.com/Shaurya2k06/VCR-Protocol"
            className="nb-btn"
            target="_blank"
            rel="noreferrer"
            style={{ 
              background: "var(--nb-accent2)", 
              color: "#fff", 
              padding: "8px 16px", 
              fontSize: "0.9rem" 
            }}
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
