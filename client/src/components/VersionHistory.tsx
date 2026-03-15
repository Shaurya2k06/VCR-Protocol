import type { DocumentVersion } from "../types/document";

interface VersionHistoryProps {
  versions: DocumentVersion[];
  currentCID: string;
  selectedCID?: string;
  restoringCID?: string | null;
  onViewVersion: (cid: string) => void;
  onRestoreVersion: (cid: string) => Promise<void> | void;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function shortenCid(cid: string): string {
  if (cid.length <= 18) {
    return cid;
  }
  return `${cid.slice(0, 10)}...${cid.slice(-8)}`;
}

export default function VersionHistory({
  versions,
  currentCID,
  selectedCID,
  restoringCID,
  onViewVersion,
  onRestoreVersion,
}: VersionHistoryProps) {
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <h2>Version History</h2>
        <p>{sortedVersions.length} immutable IPFS version(s)</p>
      </div>

      {sortedVersions.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No versions recorded yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sortedVersions.map((version, index) => {
            const isCurrent = version.cid === currentCID;
            const isSelected = selectedCID ? version.cid === selectedCID : false;
            const isRestoring = restoringCID === version.cid;

            return (
              <div
                key={`${version.cid}-${version.timestamp}-${index}`}
                className="code-block"
                style={{
                  display: "grid",
                  gap: 8,
                  border: isSelected ? "2px solid var(--nb-accent)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{`Version ${sortedVersions.length - index}`}</strong>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {isCurrent ? <span className="badge badge-green">Current</span> : null}
                    {isSelected && !isCurrent ? <span className="badge badge-blue">Viewing</span> : null}
                  </div>
                </div>

                <div className="mono" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                  CID: {version.cid}
                </div>

                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  Saved: {formatTimestamp(version.timestamp)}
                  {version.author ? ` · Author: ${version.author}` : ""}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onViewVersion(version.cid)}
                  >
                    View {shortenCid(version.cid)}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isCurrent || isRestoring}
                    onClick={() => onRestoreVersion(version.cid)}
                  >
                    {isRestoring ? "Restoring..." : "Restore"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
