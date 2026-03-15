import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./components/pages/Landing";
import AgentRegistration from "./components/pages/AgentRegistration";
import PaywallDemo from "./components/pages/PaywallDemo";
import PolicyExplorer from "./components/pages/PolicyExplorer";
import CreateAgentDoc from "./pages/CreateAgentDoc";
import ViewAgentDoc from "./pages/ViewAgentDoc";
import ViewDocPage from "./pages/ViewDocPage";
import EditDocPage from "./pages/EditDocPage";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<AgentRegistration />} />
        <Route path="/demo" element={<PaywallDemo />} />
        <Route path="/explorer" element={<PolicyExplorer />} />
        <Route path="/doc/create" element={<CreateAgentDoc />} />
        <Route path="/doc/create-agent" element={<CreateAgentDoc />} />
        <Route path="/doc/id/:id" element={<ViewDocPage />} />
        <Route path="/doc/edit/:id" element={<EditDocPage />} />
        <Route path="/doc/:cid" element={<ViewAgentDoc />} />
      </Routes>
    </BrowserRouter>
  );
}
