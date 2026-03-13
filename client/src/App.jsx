import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./components/pages/Landing";
import PolicyBuilder from "./components/pages/PolicyBuilder";
import AgentRegistration from "./components/pages/AgentRegistration";
import SpendVerifier from "./components/pages/SpendVerifier";
import PaywallDemo from "./components/pages/PaywallDemo";
import PolicyExplorer from "./components/pages/PolicyExplorer";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={<PolicyBuilder />} />
        <Route path="/register" element={<AgentRegistration />} />
        <Route path="/verify" element={<SpendVerifier />} />
        <Route path="/demo" element={<PaywallDemo />} />
        <Route path="/explorer" element={<PolicyExplorer />} />
      </Routes>
    </BrowserRouter>
  );
}