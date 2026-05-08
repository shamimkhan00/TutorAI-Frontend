import { useState } from "react";

import { formatFileSize, getDocIcon } from "../_lib/dashboard-utils";
import type { Doc } from "../_types/dashboard";
import { StatusBadge } from "./status-badge";

export function SidebarDocItem({
  doc,
  active,
  onClick,
  onDelete,
}: {
  doc: Doc;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`doc-item${active ? " active" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          fontFamily: "var(--font-mono)",
          lineHeight: 1,
          flexShrink: 0,
          color: "var(--accent)",
        }}
      >
        {getDocIcon(doc.type)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "0.8125rem",
            color: active ? "var(--text)" : "var(--text-2)",
            fontWeight: active ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 3,
          }}
        >
          {doc.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusBadge status={doc.status} />
          {doc.status === "ready" && (
            <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
              {formatFileSize(doc.size)}
            </span>
          )}
        </div>
        {(doc.status === "uploading" || doc.status === "processing") && (
          <div className="progress-track" style={{ marginTop: 5 }}>
            <div className="progress-fill" style={{ width: `${doc.progress}%` }} />
          </div>
        )}
      </div>
      {hovered && doc.status !== "uploading" && doc.status !== "processing" && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-3)",
            fontSize: "0.8rem",
            padding: "3px 5px",
            flexShrink: 0,
            transition: "color 0.15s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = "var(--danger)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "var(--text-3)";
          }}
        >
          x
        </button>
      )}
    </div>
  );
}
