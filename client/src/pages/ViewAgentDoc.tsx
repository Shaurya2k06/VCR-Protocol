import { Link, useParams } from "react-router-dom";
import DocViewer from "../components/DocViewer";

export default function ViewAgentDoc() {
  const { cid } = useParams();

  if (!cid) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 920 }}>
          <div className="alert alert-error">Missing CID in route.</div>
          <Link to="/doc/create" className="btn btn-ghost">Create an agent document</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1080 }}>
        <div className="page-header">
          <div className="badge badge-purple" style={{ marginBottom: 12 }}>Fileverse dDoc</div>
          <h1>View Agent Document</h1>
          <p>Document is fetched from IPFS by CID and rendered with Fileverse editor in preview mode.</p>
        </div>

        <DocViewer cid={cid} />
      </div>
    </div>
  );
}
