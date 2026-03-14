import { Link, useParams } from "react-router-dom";
import DocViewer from "../components/DocViewer";

export default function ViewDocPage() {
  const { cid } = useParams();

  if (!cid) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 920 }}>
          <div className="alert alert-error">Missing CID in route.</div>
          <Link to="/doc/create" className="btn btn-ghost">Create a document</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1080 }}>
        <div className="page-header">
          <div className="badge badge-purple" style={{ marginBottom: 12 }}>Fileverse dDoc</div>
          <h1>View Document</h1>
          <p>Rendered in read-only preview mode directly from IPFS JSON.</p>
        </div>

        <DocViewer cid={cid} />
      </div>
    </div>
  );
}
