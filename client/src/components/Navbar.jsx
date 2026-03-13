import { NavLink } from "react-router-dom";
import { useState } from "react";

const links = [
  { to: "/", label: "Home", exact: true },
  { to: "/build", label: "Policy Builder" },
  { to: "/register", label: "Register Agent" },
  { to: "/verify", label: "Verify Spend" },
  { to: "/demo", label: "x402 Demo" },
  { to: "/explorer", label: "Explorer" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="nav-logo">
          <div className="nav-logo-icon">V</div>
          <span>VCR Protocol</span>
        </NavLink>

        <div className="nav-links" style={{ display: open ? "flex" : undefined }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.exact}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <a
          href="https://github.com/Shaurya2k06/VCR-Protocol"
          className="btn btn-outline btn-sm"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}
