"use client";
// app/dashboard/_components/topics-panel.tsx
//
// Displays the AI-generated course outline for a document.
// Lets the user start the tutor from the beginning or from a specific topic.

import { useState } from "react";
import type { Doc, Topic } from "../_types/dashboard";
import { EmptyState } from "./empty-state";

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner:     "var(--accent)",
  intermediate: "#f59e0b",
  advanced:     "#ef4444",
};

const DIFFICULTY_BG: Record<string, string> = {
  beginner:     "rgba(232,255,71,0.1)",
  intermediate: "rgba(245,158,11,0.1)",
  advanced:     "rgba(239,68,68,0.1)",
};

interface TopicsPanelProps {
  doc: Doc;
  /** Called when the user clicks "Start from beginning" or a specific topic */
  onStartTutor: (topic: Topic | null) => void;
}

export function TopicsPanel({ doc, onStartTutor }: TopicsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Loading state ─────────────────────────────────────────────────
  if (doc.topicsLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>
          Course Outline
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{
              height: 64, background: "var(--bg-3)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", textAlign: "center", marginTop: 8 }}>
          Generating course outline…
        </p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────
  if (doc.topicsError) {
    return (
      <EmptyState
        icon="⚠️"
        title="Could not generate outline"
        desc={doc.topicsError}
      />
    );
  }

  // ── Empty state ───────────────────────────────────────────────────
  if (!doc.courseOutline || doc.courseOutline.topics.length === 0) {
    return (
      <EmptyState
        icon="📚"
        title="No course outline yet"
        desc="Topics will be extracted automatically after the document finishes processing."
      />
    );
  }

  const { courseTitle, description, topics } = doc.courseOutline;
  const totalMins = topics.reduce((s, t) => s + t.estimatedMinutes, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>
          Course Outline
        </p>
        <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
          {courseTitle}
        </p>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: 1.6 }}>
            {description}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <Pill label={`${topics.length} topics`} />
          <Pill label={`~${Math.round(totalMins / 60 * 10) / 10}h total`} />
        </div>
      </div>

      {/* ── Start from beginning ───────────────────────────────────── */}
      <button
        onClick={() => onStartTutor(null)}
        className="btn btn-primary"
        style={{ width: "100%", gap: 8, fontSize: "0.875rem", padding: "11px 16px" }}
      >
        <span style={{ fontSize: "1rem" }}>▶</span>
        Start from the beginning
      </button>

      {/* ── Topic list ────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600,
          letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Or jump to a topic
        </p>

        {topics.map((topic) => {
          const expanded = expandedId === topic.id;
          return (
            <div
              key={topic.id}
              style={{
                background: "var(--bg-3)",
                border: `1px solid ${expanded ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}
            >
              {/* Topic header row */}
              <button
                onClick={() => setExpandedId(expanded ? null : topic.id)}
                style={{
                  width: "100%", background: "none", border: "none",
                  cursor: "pointer", padding: "12px 14px",
                  display: "flex", alignItems: "flex-start",
                  gap: 10, fontFamily: "var(--font-body)", textAlign: "left",
                }}
              >
                {/* Order number */}
                <span style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: expanded ? "var(--accent)" : "var(--bg-4)",
                  color: expanded ? "#0d0e14" : "var(--text-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.6875rem", fontFamily: "var(--font-mono)", fontWeight: 700,
                  transition: "all 0.15s",
                }}>
                  {topic.order}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", color: "var(--text)",
                    fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
                    {topic.title}
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "0.6875rem", fontWeight: 600,
                      color: DIFFICULTY_COLOR[topic.difficulty],
                      background: DIFFICULTY_BG[topic.difficulty],
                      padding: "2px 7px", borderRadius: 4,
                      textTransform: "capitalize",
                    }}>
                      {topic.difficulty}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
                      ~{topic.estimatedMinutes} min
                    </span>
                  </div>
                </div>

                <span style={{
                  color: "var(--text-3)", fontSize: "0.75rem", flexShrink: 0,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  paddingTop: 4,
                }}>
                  ▾
                </span>
              </button>

              {/* Expanded detail */}
              {expanded && (
                <div style={{
                  padding: "0 14px 14px",
                  borderTop: "1px solid var(--border)",
                  paddingTop: 12,
                }}>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-2)",
                    lineHeight: 1.65, marginBottom: 10 }}>
                    {topic.summary}
                  </p>

                  {topic.subtopics.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)",
                        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                        Covers
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {topic.subtopics.map((sub, i) => (
                          <span key={i} style={{
                            fontSize: "0.75rem", color: "var(--text-2)",
                            background: "var(--bg-4)", border: "1px solid var(--border)",
                            borderRadius: 6, padding: "3px 8px",
                          }}>
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => onStartTutor(topic)}
                    className="btn btn-outline"
                    style={{ width: "100%", fontSize: "0.8125rem", padding: "9px 14px", gap: 6 }}
                  >
                    <span>▶</span>
                    Teach me this topic
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: "0.75rem", color: "var(--text-3)",
      background: "var(--bg-4)", border: "1px solid var(--border)",
      borderRadius: 20, padding: "3px 10px",
    }}>
      {label}
    </span>
  );
}