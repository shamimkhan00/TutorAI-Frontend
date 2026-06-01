"use client";

/**
 * app/dashboard/_components/dashboard-client.tsx
 *
 * Changes from previous version:
 *  - streamExplanation() helper added — reads SSE from /api/tutor/explain
 *  - handleStartTutor() now calls the real backend instead of the mock placeholder
 *  - streamAbort ref added so the user can cancel mid-stream
 *  - "◼ Stop" button shown in header while streaming
 *  - Everything else (layout, upload, topics fetch, tabs) is identical to your current file
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { backendUrl, uploadPdfToBackend } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { LogoMark } from "@/app/components/logo-mark";
import { AiAvatar, ChatMessage } from "./chat-message";
import { EmptyState } from "./empty-state";
import { KeyPointsPanel, QAPanel, SummaryPanel } from "./document-panels";
import { TopicsPanel } from "./topics-panel";
import { ProcessingState } from "./processing-state";
import { SidebarDocItem } from "./sidebar-doc-item";
import { StatusBadge } from "./status-badge";
import { createId, getDocIcon, getDocType, sleep } from "../_lib/dashboard-utils";
import { INITIAL_MESSAGES } from "../_lib/mock-data";
import type { Doc, Msg, RightTab, Topic } from "../_types/dashboard";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchTopicsFromBackend(
  documentId: string,
  token: string
): Promise<{ courseTitle: string; description: string; topics: Topic[] }> {
  const res = await fetch(
    backendUrl(`/api/topics/${encodeURIComponent(documentId)}`),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Topics request failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Opens a streaming POST to /api/tutor/explain.
 * Calls onDelta(text) for every SSE chunk, onDone() when finished,
 * onError(msg) if something goes wrong.
 * Returns an AbortController so the caller can cancel.
 */
function streamExplanation(
  {
    documentId,
    topic,
    token,
  }: { documentId: string; topic: Topic | null; token: string },
  onDelta: (delta: string) => void,
  onDone:  ()              => void,
  onError: (msg: string)   => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(backendUrl("/api/tutor/explain"), {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body:   JSON.stringify({ documentId, topic }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") onError(err?.message ?? "Network error.");
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onError(body.error ?? `Server error ${res.status}`);
      return;
    }

    // Parse the SSE stream line-by-line
    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      let done: boolean, value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        break; // aborted
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") { onDone(); return; }

        try {
          const payload = JSON.parse(raw);
          if (payload.error) { onError(payload.error); return; }
          if (payload.delta) onDelta(payload.delta);
        } catch {
          // malformed SSE frame — skip
        }
      }
    }
    onDone();
  })();

  return controller;
}

/**
 * Opens a streaming POST to /api/tutor/chat.
 * Same SSE parsing pattern as streamExplanation.
 */
function streamChat(
  {
    documentId,
    question,
    history,
    token,
  }: { documentId: string; question: string; history: { role: string; content: string }[]; token: string },
  onDelta: (delta: string) => void,
  onDone:  ()              => void,
  onError: (msg: string)   => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(backendUrl("/api/tutor/chat"), {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ documentId, question, history }),
        signal:  controller.signal,
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") onError(err?.message ?? "Network error.");
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onError(body.error ?? `Server error ${res.status}`);
      return;
    }

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      let done: boolean, value: Uint8Array | undefined;
      try { ({ done, value } = await reader.read()); } catch { break; }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") { onDone(); return; }
        try {
          const payload = JSON.parse(raw);
          if (payload.error) { onError(payload.error); return; }
          if (payload.delta) onDelta(payload.delta);
        } catch { /* skip malformed frame */ }
      }
    }
    onDone();
  })();

  return controller;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuthUser();

  /* ── Auth guard ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/sign-in");
  }, [authLoading, user, router]);

  /* ── State ──────────────────────────────────────────────────────── */
  const [docs,        setDocs]        = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [msgs,        setMsgs]        = useState<Msg[]>(INITIAL_MESSAGES);
  const [input,       setInput]       = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [rightTab,    setRightTab]    = useState<RightTab>("summary");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightOpen,   setRightOpen]   = useState(true);
  const [dragging,    setDragging]    = useState(false);
  const [signingOut,  setSigningOut]  = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  // ── NEW: holds the AbortController for the active SSE stream ─────
  const streamAbort  = useRef<AbortController | null>(null);

  const activeDoc = docs.find(d => d.id === activeDocId) ?? null;
  const readyDocs = docs.filter(d => d.status === "ready");

  /* ── Scroll chat to bottom ──────────────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  /* ── Auto-resize textarea ───────────────────────────────────────── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  /* ── Cancel stream on unmount ───────────────────────────────────── */
  useEffect(() => () => { streamAbort.current?.abort(); }, []);

  /* ── Sign out ───────────────────────────────────────────────────── */
  async function handleSignOut() {
    setSigningOut(true);
    streamAbort.current?.abort();
    await signOut(auth);
    router.replace("/");
  }

  /* ── Fetch topics (called after successful upload) ──────────────── */
  const fetchTopics = useCallback(async (documentId: string) => {
    if (!auth.currentUser) return;

    setDocs(prev =>
      prev.map(d =>
        d.id === documentId ? { ...d, topicsLoading: true, topicsError: undefined } : d
      )
    );

    try {
      const token = await auth.currentUser.getIdToken();
      const data  = await fetchTopicsFromBackend(documentId, token);

      setDocs(prev =>
        prev.map(d =>
          d.id === documentId
            ? {
                ...d,
                topicsLoading: false,
                courseOutline: {
                  courseTitle: data.courseTitle,
                  description: data.description,
                  topics:      data.topics,
                  fromCache:   (data as any).fromCache ?? false,
                },
              }
            : d
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load topics.";
      setDocs(prev =>
        prev.map(d =>
          d.id === documentId
            ? { ...d, topicsLoading: false, topicsError: message }
            : d
        )
      );
    }
  }, []);

  /* ── Start tutor — REAL SSE streaming ───────────────────────────── */
  const handleStartTutor = useCallback(async (topic: Topic | null) => {
    const doc = activeDoc;
    if (!doc || !auth.currentUser) return;

    // Cancel any previous in-flight stream
    streamAbort.current?.abort();
    streamAbort.current = null;

    // Friendly label shown in the user bubble
    const userLabel = topic
      ? `Teach me: **"${topic.title}"**`
      : `Start teaching me "${doc.name}" from the beginning`;

    setMsgs(prev => [...prev, { id: createId(), role: "user", content: userLabel }]);
    setChatLoading(true);
    setRightTab("summary"); // focus chat area

    // Empty AI bubble that fills up as tokens arrive
    const aiId = createId();
    setMsgs(prev => [...prev, { id: aiId, role: "assistant", content: "", streaming: true }]);

    let token: string;
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      setMsgs(prev => prev.map(m =>
        m.id === aiId
          ? { ...m, content: "Authentication error — please sign in again.", streaming: false }
          : m
      ));
      setChatLoading(false);
      return;
    }

    // Accumulate text outside React state to avoid stale closure issues
    let accumulated = "";

    const controller = streamExplanation(
      { documentId: doc.id, topic, token },

      // onDelta — called for every text chunk from Gemini
      (delta) => {
        accumulated += delta;
        const snapshot = accumulated;
        setMsgs(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: snapshot } : m
        ));
      },

      // onDone — stream finished cleanly
      () => {
        setMsgs(prev => prev.map(m =>
          m.id === aiId ? { ...m, streaming: false } : m
        ));
        setChatLoading(false);
        streamAbort.current = null;
      },

      // onError — show error in the bubble
      (errMsg) => {
        setMsgs(prev => prev.map(m =>
          m.id === aiId
            ? {
                ...m,
                streaming: false,
                content: accumulated
                  ? accumulated + `\n\n⚠️ Stream interrupted: ${errMsg}`
                  : `Sorry, I couldn't generate an explanation: ${errMsg}`,
              }
            : m
        ));
        setChatLoading(false);
        streamAbort.current = null;
      }
    );

    streamAbort.current = controller;
  }, [activeDoc]);

  /* ── File upload ─────────────────────────────────────────────────── */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);

    if (!arr.length) {
      setMsgs(prev => [...prev, { id: createId(), role: "assistant",
        content: "Please select a PDF file before uploading." }]);
      return;
    }

    if (!auth.currentUser) {
      setMsgs(prev => [...prev, { id: createId(), role: "assistant",
        content: "Please sign in before uploading a PDF." }]);
      return;
    }
    const currentUser = auth.currentUser;

    const pdfs = arr.filter(f => f.type === "application/pdf");
    if (!pdfs.length) {
      setMsgs(prev => [...prev, { id: createId(), role: "assistant",
        content: "Only PDF files are supported right now. Please choose a PDF and try again." }]);
      return;
    }

    for (const file of pdfs) {
      const id = crypto.randomUUID();
      const newDoc: Doc = {
        id, name: file.name, type: getDocType(file),
        size: file.size, status: "uploading", progress: 0,
      };
      setDocs(prev => [...prev, newDoc]);
      setActiveDocId(id);
      setRightTab("summary");

      try {
        const token = await currentUser.getIdToken();
        setDocs(prev => prev.map(d => d.id === id ? { ...d, progress: 35 } : d));

        const data = await uploadPdfToBackend(file, token, id);

        setDocs(prev => prev.map(d =>
          d.id === id ? { ...d, status: "processing", progress: 90 } : d
        ));
        setUploadedDocumentId(data.documentId);

        setDocs(prev => prev.map(d =>
          d.id === id ? {
            ...d,
            id:       data.documentId,
            status:   "ready",
            progress: 100,
            summary:  `PDF uploaded successfully. Processed ${data.chunkCount} chunks across ${data.pageCount} pages. Use the Topics tab to see your course outline, or start chatting.`,
            keyPoints: [
              `${data.chunkCount} content chunks extracted`,
              `${data.pageCount} pages processed`,
              "Course outline is being generated — check the Topics tab",
              "Ask questions in the chat once the chat API is connected",
            ],
            qaList: [
              {
                q: "Where do I start?",
                a: "Open the Topics tab in the right panel to see a full course outline extracted from your document. Click any topic to start learning it.",
              },
            ],
          } : d
        ));
        setActiveDocId(data.documentId);

        setMsgs(prev => [...prev, {
          id: createId(), role: "assistant",
          content: `✅ **${file.name}** uploaded and processed!\n\n` +
            `- **${data.chunkCount}** content chunks extracted\n` +
            `- **${data.pageCount}** pages analysed\n\n` +
            `Open the **Topics** tab on the right to see your personalised course outline. ` +
            `You can start from the beginning or jump to any topic.`,
        }]);

        setRightTab("topics");
        fetchTopics(data.documentId);

      } catch (error) {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "error" } : d));
        setMsgs(prev => [...prev, {
          id: createId(), role: "assistant",
          content: error instanceof Error ? error.message : "Upload failed",
        }]);
      }
    }
  }, [fetchTopics]);

  /* ── Drag & drop ─────────────────────────────────────────────────── */
  function handleDragOver(e: DragEvent)  { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  /* ── Send message — REAL streaming chat ─────────────────────────── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    // No document uploaded yet
    if (!activeDoc || activeDoc.status !== "ready") {
      setMsgs(prev => [...prev,
        { id: createId(), role: "user",      content: text },
        { id: createId(), role: "assistant", content: "Please upload a PDF first, then use the **Topics** tab to start learning!" },
      ]);
      setInput("");
      return;
    }

    setInput("");
    streamAbort.current?.abort();
    streamAbort.current = null;

    // Snapshot current history BEFORE adding the new user message
    // (last 10 non-empty messages for context, excluding the initial welcome)
    const historySnapshot = msgs
      .filter(m => m.content && !m.streaming)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    // Add user bubble
    setMsgs(prev => [...prev, { id: createId(), role: "user", content: text }]);
    setChatLoading(true);

    // Add empty AI bubble
    const aiId = createId();
    setMsgs(prev => [...prev, { id: aiId, role: "assistant", content: "", streaming: true }]);

    let token: string;
    try {
      token = await auth.currentUser!.getIdToken();
    } catch {
      setMsgs(prev => prev.map(m =>
        m.id === aiId
          ? { ...m, content: "Authentication error — please sign in again.", streaming: false }
          : m
      ));
      setChatLoading(false);
      return;
    }

    let accumulated = "";

    const controller = streamChat(
      { documentId: activeDoc.id, question: text, history: historySnapshot, token },

      (delta) => {
        accumulated += delta;
        const snapshot = accumulated;
        setMsgs(prev => prev.map(m => m.id === aiId ? { ...m, content: snapshot } : m));
      },

      () => {
        setMsgs(prev => prev.map(m => m.id === aiId ? { ...m, streaming: false } : m));
        setChatLoading(false);
        streamAbort.current = null;
      },

      (errMsg) => {
        setMsgs(prev => prev.map(m =>
          m.id === aiId
            ? {
                ...m,
                streaming: false,
                content: accumulated
                  ? accumulated + `\n\n⚠️ ${errMsg}`
                  : `Sorry, something went wrong: ${errMsg}`,
              }
            : m
        ));
        setChatLoading(false);
        streamAbort.current = null;
      }
    );

    streamAbort.current = controller;
  }, [input, chatLoading, activeDoc, msgs]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  /* ── Stop the active stream ─────────────────────────────────────── */
  function handleStopStream() {
    streamAbort.current?.abort();
    streamAbort.current = null;
    setChatLoading(false);
    // Mark the last streaming bubble as stopped
    setMsgs(prev => prev.map((m, i) =>
      i === prev.length - 1 && m.streaming
        ? { ...m, streaming: false, content: m.content + "\n\n*(stopped)*" }
        : m
    ));
  }

  /* ── Loading screen ──────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg)" }}>
        <span className="spinner" style={{ width: 24, height: 24, color: "var(--text-3)" }} />
      </div>
    );
  }
  if (!user) return null;

  /* ═══════════════════════════════════════════════════════════════════
     RENDER — identical structure to your current file
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{ display: "flex", height: "100dvh", overflow: "hidden",
        background: "var(--bg)", position: "relative" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Global drag overlay ──────────────────────────────────── */}
      {dragging && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(13,14,20,0.88)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(6px)", gap: 16,
        }}>
          <div style={{
            border: "2px dashed var(--accent)", borderRadius: "var(--radius-xl)",
            padding: "64px 96px", textAlign: "center", background: "rgba(232,255,71,0.04)",
          }}>
            <div style={{ fontSize: "3rem", marginBottom: 16, opacity: 0.8 }}>⬆</div>
            <p className="font-display" style={{ fontSize: "1.6rem", color: "var(--accent)", marginBottom: 8 }}>
              Drop to upload
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "0.9375rem" }}>PDF files only</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════════════════════════════ */}
      {sidebarOpen && (
        <aside style={{
          width: 264, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Logo row */}
          <div style={{
            padding: "18px 18px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <LogoMark size={30} />
            <button className="btn btn-icon" onClick={() => setSidebarOpen(false)}
              title="Collapse" style={{ width: 30, height: 30 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </button>
          </div>

          {/* Upload button */}
          <div style={{ padding: "14px 14px 8px" }}>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={e => e.target.files && handleFiles(e.target.files)} />
            <button className="btn btn-outline"
              style={{ width: "100%", gap: 8, fontSize: "0.875rem", padding: "10px 14px" }}
              onClick={() => fileInputRef.current?.click()}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span>
              Upload document
            </button>
          </div>

          {/* Document list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
            {docs.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center",
                color: "var(--text-3)", fontSize: "0.875rem", lineHeight: 1.7 }}>
                <div style={{ fontSize: "2rem", marginBottom: 10, opacity: 0.3 }}>📂</div>
                No documents yet.<br />Upload a PDF<br />to start learning.
              </div>
            ) : (
              <>
                <p style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em",
                  textTransform: "uppercase", color: "var(--text-3)", padding: "10px 4px 6px" }}>
                  Documents ({docs.length})
                </p>
                {docs.map(doc => (
                  <SidebarDocItem
                    key={doc.id} doc={doc}
                    active={doc.id === activeDocId}
                    onClick={() => { setActiveDocId(doc.id); setRightTab("topics"); }}
                    onDelete={() => {
                      setDocs(prev => prev.filter(d => d.id !== doc.id));
                      if (activeDocId === doc.id) setActiveDocId(null);
                    }}
                  />
                ))}
              </>
            )}
          </div>

          {/* User footer */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--accent)", color: "#0d0e14",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.8125rem", fontWeight: 600, flexShrink: 0,
            }}>
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.8125rem", color: "var(--text)", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </p>
            </div>
            <button className="btn btn-ghost"
              style={{ padding: "5px 8px", fontSize: "0.75rem", flexShrink: 0 }}
              onClick={handleSignOut} disabled={signingOut} title="Sign out">
              {signingOut
                ? <span className="spinner" style={{ width: 13, height: 13 }} />
                : "↩"}
            </button>
          </div>
        </aside>
      )}

      {/* ════════════════════════════════════════════════════════════
          CENTER: CHAT
      ══════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: 54, flexShrink: 0, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", padding: "0 18px", gap: 10,
          background: "var(--bg-2)",
        }}>
          {!sidebarOpen && (
            <button className="btn btn-icon" onClick={() => setSidebarOpen(true)} title="Open sidebar">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5" />
              </svg>
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            {activeDoc ? (
              <>
                <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)",
                  lineHeight: 1, color: "var(--accent)" }}>{getDocIcon(activeDoc.type)}</span>
                <span style={{ fontSize: "0.875rem", color: "var(--text-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeDoc.name}
                </span>
                <StatusBadge status={activeDoc.status} />
                {activeDoc.courseOutline && (
                  <span style={{
                    fontSize: "0.6875rem", color: "var(--accent)",
                    background: "rgba(232,255,71,0.1)", border: "1px solid rgba(232,255,71,0.2)",
                    borderRadius: 20, padding: "2px 8px", fontWeight: 600,
                  }}>
                    {activeDoc.courseOutline.topics.length} topics
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: "0.875rem", color: "var(--text-3)" }}>
                {docs.length === 0 ? "Upload a document to begin" : "Select a document from the sidebar"}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* ── Stop button — only shown while SSE streaming ── */}
            {chatLoading && streamAbort.current && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", padding: "6px 12px",
                  color: "var(--accent)", borderColor: "rgba(232,255,71,0.25)" }}
                onClick={handleStopStream}
              >
                ◼ Stop
              </button>
            )}
            {msgs.length > 1 && !chatLoading && (
              <button className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", padding: "6px 12px" }}
                onClick={() => setMsgs(INITIAL_MESSAGES)}>
                Clear chat
              </button>
            )}
            {!rightOpen && (
              <button className="btn btn-icon" onClick={() => setRightOpen(true)} title="Open panel">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 2l-5 5 5 5" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px",
          display: "flex", flexDirection: "column", gap: 20 }}>
          {msgs.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
          {chatLoading && msgs[msgs.length - 1]?.role === "user" && (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <AiAvatar />
              <div className="bubble-ai" style={{ padding: "14px 18px" }}>
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested prompts */}
        {msgs.length === 1 && readyDocs.length > 0 && (
          <div style={{ padding: "0 24px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              "Summarise this document for me",
              "Explain the main concepts simply",
              "What are the key things I should know?",
              "Quiz me on this material",
            ].map(prompt => (
              <button key={prompt} className="btn btn-outline"
                style={{ fontSize: "0.8125rem", padding: "8px 14px" }}
                onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px", background: "var(--bg-2)" }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: "var(--bg-3)", border: "1px solid var(--border-2)",
            borderRadius: "var(--radius-lg)", padding: "10px 10px 10px 16px",
          }}>
            <input type="file" multiple accept=".pdf,application/pdf"
              style={{ display: "none" }} id="chat-file"
              onChange={e => e.target.files && handleFiles(e.target.files)} />
            <label htmlFor="chat-file" title="Attach file"
              style={{ color: "var(--text-3)", cursor: "pointer", fontSize: "1.25rem",
                lineHeight: 1, paddingBottom: 7, flexShrink: 0, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
              ⊕
            </label>
            <textarea ref={textareaRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} disabled={chatLoading}
              placeholder={
                readyDocs.length > 0
                  ? `Ask anything about ${readyDocs.length === 1 ? `"${readyDocs[0].name}"` : `your ${readyDocs.length} documents`}…`
                  : "Upload a document first…"
              }
              rows={1}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontFamily: "var(--font-body)", fontSize: "0.9375rem",
                color: "var(--text)", resize: "none", lineHeight: 1.6,
                paddingTop: 6, minHeight: 28, maxHeight: 160,
              }} />
            <button onClick={sendMessage} disabled={!input.trim() || chatLoading}
              style={{
                width: 38, height: 38, flexShrink: 0,
                background: input.trim() && !chatLoading ? "var(--accent)" : "var(--bg-4)",
                border: "none", borderRadius: "var(--radius)",
                cursor: input.trim() && !chatLoading ? "pointer" : "default",
                color: input.trim() && !chatLoading ? "#0d0e14" : "var(--text-3)",
                fontSize: "1.05rem", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
              {chatLoading
                ? <span className="spinner" style={{ width: 15, height: 15 }} />
                : "↑"}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-3)",
            marginTop: 10, lineHeight: 1.5 }}>
            TutorAI only answers based on your uploaded documents — no hallucinations.
          </p>
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════
          RIGHT PANEL
      ══════════════════════════════════════════════════════════════ */}
      {rightOpen && (
        <aside style={{
          width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)",
          background: "var(--bg-2)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Tab bar */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 8 }}>
            <div className="tab-bar" style={{ flex: 1 }}>
              {(["topics", "summary", "keypoints", "qa"] as RightTab[]).map(t => (
                <div key={t} className={`tab-item${rightTab === t ? " active" : ""}`}
                  onClick={() => setRightTab(t)}>
                  {{ topics: "Topics", summary: "Summary", keypoints: "Key Points", qa: "Q & A" }[t]}
                </div>
              ))}
            </div>
            <button className="btn btn-icon" style={{ width: 30, height: 30, flexShrink: 0 }}
              onClick={() => setRightOpen(false)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px" }}>
            {!activeDoc ? (
              <EmptyState icon="📄" title="No document selected"
                desc="Select or upload a document to see its course outline, summary, key points, and Q&A." />
            ) : activeDoc.status !== "ready" ? (
              <ProcessingState status={activeDoc.status} progress={activeDoc.progress} name={activeDoc.name} />
            ) : (
              <>
                {rightTab === "topics"    && <TopicsPanel doc={activeDoc} onStartTutor={handleStartTutor} />}
                {rightTab === "summary"   && <SummaryPanel doc={activeDoc} />}
                {rightTab === "keypoints" && <KeyPointsPanel doc={activeDoc} />}
                {rightTab === "qa"        && <QAPanel doc={activeDoc}
                  onAsk={q => { setInput(q); textareaRef.current?.focus(); }} />}
              </>
            )}
          </div>

          {/* Drop zone at bottom */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
            <div className="dropzone" style={{ padding: "22px 16px" }}
              onClick={() => fileInputRef.current?.click()}>
              <p style={{ fontSize: "0.875rem", color: "var(--text-3)", lineHeight: 1.6 }}>
                <span style={{ color: "var(--accent)", fontWeight: 500 }}>Click</span> or drag & drop
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 4 }}>PDF files only</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}