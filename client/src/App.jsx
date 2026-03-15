import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./components/pages/Landing";
import AgentRegistration from "./components/pages/AgentRegistration";
import Demos from "./components/pages/Demos";
import PolicyExplorer from "./components/pages/PolicyExplorer";
import CreateAgentDoc from "./pages/CreateAgentDoc";
import ViewAgentDoc from "./pages/ViewAgentDoc";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<AgentRegistration />} />
        <Route path="/demo" element={<Demos />} />
        <Route path="/demos" element={<Demos />} />
        <Route path="/explorer" element={<PolicyExplorer />} />
        <Route path="/doc/create" element={<CreateAgentDoc />} />
        <Route path="/doc/create-agent" element={<CreateAgentDoc />} />
        <Route path="/doc/:cid" element={<ViewAgentDoc />} />
      </Routes>
    </BrowserRouter>
  );
}
