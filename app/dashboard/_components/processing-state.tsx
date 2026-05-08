import type { DocStatus } from "../_types/dashboard";

export function ProcessingState({
  status,
  progress,
  name,
}: {
  status: DocStatus;
  progress: number;
  name: string;
}) {
  return (
    <div style={{ padding: "32px 8px" }}>
      <p style={{ fontSize: "0.875rem", color: "var(--text-2)", marginBottom: 6 }}>
        {status === "uploading" ? "Uploading..." : "Reading document..."}
      </p>
      <p
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-3)",
          marginBottom: 20,
          lineHeight: 1.5,
        }}
      >
        {name}
      </p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p
        style={{
          textAlign: "right",
          fontSize: "0.75rem",
          color: "var(--text-3)",
          marginTop: 6,
          fontFamily: "var(--font-mono)",
        }}
      >
        {progress}%
      </p>
    </div>
  );
}
