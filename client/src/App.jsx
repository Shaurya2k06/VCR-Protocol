import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./components/pages/Landing";
import AgentRegistration from "./components/pages/AgentRegistration";
import Demos from "./components/pages/Demos";
import PolicyExplorer from "./components/pages/PolicyExplorer";

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
      </Routes>
    </BrowserRouter>
  );
}
