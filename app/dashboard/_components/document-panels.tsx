import { useState } from "react";

import type { Doc } from "../_types/dashboard";
import { EmptyState } from "./empty-state";

export function SummaryPanel({ doc }: { doc: Doc }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(doc.summary ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <p
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          AI Summary
        </p>
        <button
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: "0.75rem" }}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p
        style={{
          fontSize: "0.9375rem",
          color: "var(--text-2)",
          lineHeight: 1.75,
          wordBreak: "break-word",
        }}
      >
        {doc.summary ?? "No summary available yet."}
      </p>
    </div>
  );
}

export function KeyPointsPanel({ doc }: { doc: Doc }) {
  const points = doc.keyPoints ?? [];

  if (!points.length) {
    return (
      <EmptyState
        icon="..."
        title="No key points"
        desc="Key points will appear after the document is processed."
      />
    );
  }

  return (
    <div>
      <p
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 14,
        }}
      >
        Key Points
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {points.map((point, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 14px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                background: "var(--accent-dim)",
                color: "var(--accent)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            >
              {index + 1}
            </span>
            <p style={{ fontSize: "0.875rem", color: "var(--text-2)", lineHeight: 1.65 }}>
              {point}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QAPanel({
  doc,
  onAsk,
}: {
  doc: Doc;
  onAsk: (question: string) => void;
}) {
  const qa = doc.qaList ?? [];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <p
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            marginBottom: 4,
          }}
        >
          Study Q&A
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: 1.55 }}>
          Click a question to ask it in chat, or ask your own below.
        </p>
      </div>
      {qa.length === 0 ? (
        <EmptyState
          icon="?"
          title="No Q&A yet"
          desc="Q&A pairs will be generated once your backend is connected."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {qa.map((item, index) => (
            <div
              key={index}
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => onAsk(item.q)}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "12px 14px",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontFamily: "var(--font-body)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    background: "var(--accent-dim)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  Q
                </span>
                <span style={{ fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.55 }}>
                  {item.q}
                </span>
              </button>
              <div
                style={{
                  padding: "10px 14px",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    background: "var(--bg-4)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  A
                </span>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-2)", lineHeight: 1.65 }}>
                  {item.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
