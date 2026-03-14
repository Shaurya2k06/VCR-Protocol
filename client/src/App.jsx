import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./components/pages/Landing";
import AgentRegistration from "./components/pages/AgentRegistration";
import PaywallDemo from "./components/pages/PaywallDemo";
import PolicyExplorer from "./components/pages/PolicyExplorer";
import CreateDocPage from "./pages/CreateDocPage";
import ViewDocPage from "./pages/ViewDocPage";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<AgentRegistration />} />
        <Route path="/demo" element={<PaywallDemo />} />
        <Route path="/explorer" element={<PolicyExplorer />} />
        <Route path="/doc/create" element={<CreateDocPage />} />
        <Route path="/doc/:cid" element={<ViewDocPage />} />
      </Routes>
    </BrowserRouter>
  );
}
