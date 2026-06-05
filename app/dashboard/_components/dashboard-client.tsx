"use client";

/**
 * app/dashboard/_components/dashboard-client.tsx
 *
 * New in this version:
 *  - loadDocuments() on mount: fetches existing docs from MongoDB and
 *    restores them into state so they survive page refresh
 *  - Chat history persisted to localStorage keyed by userId
 *  - Delete button calls DELETE /api/documents/:id which removes the
 *    document + all its chunks from the database
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
import {
  backendUrl,
  uploadPdfToBackend,
  fetchUserDocuments,
  deleteDocumentFromBackend,
  type BackendDocument,
} from "@/lib/api";
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
import { createId, getDocIcon, getDocType } from "../_lib/dashboard-utils";
import { INITIAL_MESSAGES } from "../_lib/mock-data";
import type { Doc, Msg, RightTab, Topic } from "../_types/dashboard";

// ─── localStorage helpers ─────────────────────────────────────────────────────

function chatKey(userId: string) { return `tutor_chat_${userId}`; }

function saveChat(userId: string, msgs: Msg[]) {
  try {
    // Only persist the last 60 messages, never streaming ones
    const toSave = msgs.filter(m => !m.streaming).slice(-60);
    localStorage.setItem(chatKey(userId), JSON.stringify(toSave));
  } catch { /* storage full / SSR — ignore */ }
}

function loadChat(userId: string): Msg[] {
  try {
    const raw = localStorage.getItem(chatKey(userId));
    if (!raw) return INITIAL_MESSAGES;
    const parsed = JSON.parse(raw) as Msg[];
    return parsed.length > 0 ? parsed : INITIAL_MESSAGES;
  } catch {
    return INITIAL_MESSAGES;
  }
}

// ─── Convert a BackendDocument → Doc (frontend shape) ────────────────────────

function backendDocToDoc(bd: BackendDocument): Doc {
  return {
    id:       bd._id,
    name:     bd.originalFileName,
    type:     "pdf",
    size:     0,                          // not stored — not needed after restore
    status:   bd.processingStatus === "completed" ? "ready" : "error",
    progress: 100,
    summary:  bd.summary,
    keyPoints: [],
    qaList:   [],
    courseOutline: bd.topics && bd.topics.length > 0
      ? {
          courseTitle: bd.courseTitle  ?? bd.title,
          description: bd.courseDescription ?? "",
          topics:      bd.topics as any,
          fromCache:   true,
        }
      : undefined,
  };
}

// ─── SSE stream helpers ───────────────────────────────────────────────────────

function makeSSEStream(
  url: string,
  body: object,
  token: string,
  onDelta: (d: string) => void,
  onDone:  ()          => void,
  onError: (m: string) => void
): AbortController {
  const ctrl = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") onError(err?.message ?? "Network error.");
      return;
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      onError(b.error ?? `Server error ${res.status}`);
      return;
    }

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";

    while (true) {
      let done: boolean, value: Uint8Array | undefined;
      try { ({ done, value } = await reader.read()); } catch { break; }
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") { onDone(); return; }
        try {
          const p = JSON.parse(raw);
          if (p.error) { onError(p.error); return; }
          if (p.delta) onDelta(p.delta);
        } catch { /* skip */ }
      }
    }
    onDone();
  })();

  return ctrl;
}

function streamExplanation(
  { documentId, topic, token }:
  { documentId: string; topic: Topic | null; token: string },
  onDelta: (d: string) => void,
  onDone:  ()          => void,
  onError: (m: string) => void
) {
  return makeSSEStream(
    backendUrl("/api/tutor/explain"),
    { documentId, topic },
    token, onDelta, onDone, onError
  );
}

function streamChat(
  { documentId, question, history, token }:
  { documentId: string; question: string; history: { role: string; content: string }[]; token: string },
  onDelta: (d: string) => void,
  onDone:  ()          => void,
  onError: (m: string) => void
) {
  return makeSSEStream(
    backendUrl("/api/tutor/chat"),
    { documentId, question, history },
    token, onDelta, onDone, onError
  );
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function fetchTopicsFromBackend(
  documentId: string,
  token: string
): Promise<{ courseTitle: string; description: string; topics: Topic[] }> {
  const res = await fetch(
    backendUrl(`/api/topics/${encodeURIComponent(documentId)}`),
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Topics request failed: ${res.status}`);
  }
  return res.json();
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
  const [docs,          setDocs]          = useState<Doc[]>([]);
  const [activeDocId,   setActiveDocId]   = useState<string | null>(null);
  const [msgs,          setMsgs]          = useState<Msg[]>(INITIAL_MESSAGES);
  const [input,         setInput]         = useState("");
  const [chatLoading,   setChatLoading]   = useState(false);
  const [rightTab,      setRightTab]      = useState<RightTab>("topics");
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [rightOpen,     setRightOpen]     = useState(true);
  const [dragging,      setDragging]      = useState(false);
  const [signingOut,    setSigningOut]    = useState(false);
  const [docsLoading,   setDocsLoading]   = useState(true); // true while restoring docs
  const [isMobile,      setIsMobile]      = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const streamAbort  = useRef<AbortController | null>(null);

  const activeDoc = docs.find(d => d.id === activeDocId) ?? null;
  const readyDocs = docs.filter(d => d.status === "ready");
  const mobilePanelOpen = isMobile && (sidebarOpen || rightOpen);

  const chatRestored = useRef(false); // guard: don't persist before restore

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1024px)");
    const sync = (matches: boolean) => setIsMobile(matches);

    sync(media.matches);

    const handleChange = (event: MediaQueryListEvent) => sync(event.matches);
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setSidebarOpen(!isMobile);
    setRightOpen(!isMobile);
  }, [isMobile]);

  /* ── Restore documents + chat from backend / localStorage ────────── */
  useEffect(() => {
    if (authLoading || !user) return;

    // ── Restore chat SYNCHRONOUSLY first, before any async work ──────
    // This prevents the persist effect from overwriting localStorage
    // with INITIAL_MESSAGES before the saved chat is loaded.
    if (!chatRestored.current) {
      const savedMsgs = loadChat(user.uid);
      setMsgs(savedMsgs);
      chatRestored.current = true;
    }

    // ── Then restore documents from backend (async) ───────────────────
    (async () => {
      setDocsLoading(true);
      try {
        const token       = await auth.currentUser!.getIdToken();
        const backendDocs = await fetchUserDocuments(token);
        const restored    = backendDocs.map(backendDocToDoc);
        setDocs(restored);
        if (restored.length > 0) setActiveDocId(restored[0].id);
      } catch (err) {
        console.error("Failed to restore documents:", err);
      } finally {
        setDocsLoading(false);
      }
    })();
  }, [authLoading, user]);

  /* ── Persist chat to localStorage — only after restore is done ───── */
  useEffect(() => {
    if (!user || !chatRestored.current) return;
    saveChat(user.uid, msgs);
  }, [msgs, user]);

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

  /* ── Fetch topics ───────────────────────────────────────────────── */
  const fetchTopics = useCallback(async (documentId: string) => {
    if (!auth.currentUser) return;
    setDocs(prev => prev.map(d =>
      d.id === documentId ? { ...d, topicsLoading: true, topicsError: undefined } : d
    ));
    try {
      const token = await auth.currentUser.getIdToken();
      const data  = await fetchTopicsFromBackend(documentId, token);
      setDocs(prev => prev.map(d =>
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
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load topics.";
      setDocs(prev => prev.map(d =>
        d.id === documentId ? { ...d, topicsLoading: false, topicsError: message } : d
      ));
    }
  }, []);

  /* ── Delete document — removes from DB + frontend state ─────────── */
  const handleDeleteDoc = useCallback(async (docId: string) => {
    // Optimistically remove from UI immediately
    setDocs(prev => prev.filter(d => d.id !== docId));
    if (activeDocId === docId) setActiveDocId(null);

    try {
      const token = await auth.currentUser!.getIdToken();
      await deleteDocumentFromBackend(docId, token);
    } catch (err) {
      console.error("Failed to delete document from backend:", err);
      // Don't re-add to UI — the user already dismissed it.
      // A page refresh will reconcile with the real DB state.
    }
  }, [activeDocId]);

  /* ── Start tutor — SSE explanation ─────────────────────────────── */
  const handleStartTutor = useCallback(async (topic: Topic | null) => {
    const doc = activeDoc;
    if (!doc || !auth.currentUser) return;

    streamAbort.current?.abort();
    streamAbort.current = null;

    const userLabel = topic
      ? `Teach me: **"${topic.title}"**`
      : `Start teaching me "${doc.name}" from the beginning`;

    if (isMobile) setRightOpen(false);
    setMsgs(prev => [...prev, { id: createId(), role: "user", content: userLabel }]);
    setChatLoading(true);
    setRightTab("topics");

    const aiId = createId();
    setMsgs(prev => [...prev, { id: aiId, role: "assistant", content: "", streaming: true }]);

    let token: string;
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      setMsgs(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: "Authentication error — please sign in again.", streaming: false } : m
      ));
      setChatLoading(false);
      return;
    }

    let accumulated = "";

    const ctrl = streamExplanation(
      { documentId: doc.id, topic, token },
      (delta) => {
        accumulated += delta;
        const snap = accumulated;
        setMsgs(prev => prev.map(m => m.id === aiId ? { ...m, content: snap } : m));
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
                ...m, streaming: false,
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

    streamAbort.current = ctrl;
  }, [activeDoc, isMobile]);

  /* ── File upload ─────────────────────────────────────────────────── */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr  = Array.from(files);
    const pdfs = arr.filter(f => f.type === "application/pdf");

    if (!pdfs.length) {
      setMsgs(prev => [...prev, { id: createId(), role: "assistant",
        content: "Only PDF files are supported. Please choose a PDF and try again." }]);
      return;
    }

    if (!auth.currentUser) {
      setMsgs(prev => [...prev, { id: createId(), role: "assistant",
        content: "Please sign in before uploading a PDF." }]);
      return;
    }
    const currentUser = auth.currentUser;

    for (const file of pdfs) {
      const tempId = crypto.randomUUID();
      setDocs(prev => [...prev, {
        id: tempId, name: file.name, type: getDocType(file),
        size: file.size, status: "uploading", progress: 0,
      }]);
      setActiveDocId(tempId);
      setRightTab("topics");

      try {
        const token = await currentUser.getIdToken();
        setDocs(prev => prev.map(d => d.id === tempId ? { ...d, progress: 35 } : d));

        const data = await uploadPdfToBackend(file, token, tempId);

        setDocs(prev => prev.map(d => d.id === tempId
          ? { ...d, status: "processing", progress: 90 } : d));

        setDocs(prev => prev.map(d => d.id === tempId ? {
          ...d,
          id:       data.documentId,
          status:   "ready",
          progress: 100,
          summary:  `PDF uploaded. ${data.chunkCount} chunks across ${data.pageCount} pages.`,
          keyPoints: [
            `${data.chunkCount} chunks extracted`,
            `${data.pageCount} pages processed`,
          ],
          qaList: [],
        } : d));
        setActiveDocId(data.documentId);
        if (isMobile) {
          setSidebarOpen(false);
          setRightOpen(true);
        }

        setMsgs(prev => [...prev, {
          id: createId(), role: "assistant",
          content:
            `✅ **${file.name}** uploaded!\n\n` +
            `- **${data.chunkCount}** chunks · **${data.pageCount}** pages\n\n` +
            `Open the **Topics** tab to see your course outline.`,
        }]);

        fetchTopics(data.documentId);

      } catch (error) {
        setDocs(prev => prev.map(d => d.id === tempId ? { ...d, status: "error" } : d));
        setMsgs(prev => [...prev, {
          id: createId(), role: "assistant",
          content: error instanceof Error ? error.message : "Upload failed",
        }]);
      }
    }
  }, [fetchTopics, isMobile]);

  /* ── Drag & drop ─────────────────────────────────────────────────── */
  function handleDragOver(e: DragEvent)  { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  /* ── Send message — streaming chat ──────────────────────────────── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

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

    const historySnapshot = msgs
      .filter(m => m.content && !m.streaming)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    setMsgs(prev => [...prev, { id: createId(), role: "user", content: text }]);
    setChatLoading(true);

    const aiId = createId();
    setMsgs(prev => [...prev, { id: aiId, role: "assistant", content: "", streaming: true }]);

    let token: string;
    try {
      token = await auth.currentUser!.getIdToken();
    } catch {
      setMsgs(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: "Authentication error — please sign in again.", streaming: false } : m
      ));
      setChatLoading(false);
      return;
    }

    let accumulated = "";

    const ctrl = streamChat(
      { documentId: activeDoc.id, question: text, history: historySnapshot, token },
      (delta) => {
        accumulated += delta;
        const snap = accumulated;
        setMsgs(prev => prev.map(m => m.id === aiId ? { ...m, content: snap } : m));
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
                ...m, streaming: false,
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

    streamAbort.current = ctrl;
  }, [input, chatLoading, activeDoc, msgs]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleStopStream() {
    streamAbort.current?.abort();
    streamAbort.current = null;
    setChatLoading(false);
    setMsgs(prev => prev.map((m, i) =>
      i === prev.length - 1 && m.streaming
        ? { ...m, streaming: false, content: m.content + "\n\n*(stopped)*" }
        : m
    ));
  }

  function openSidebar() {
    if (isMobile) setRightOpen(false);
    setSidebarOpen(true);
  }

  function openRightPanel() {
    if (isMobile) setSidebarOpen(false);
    setRightOpen(true);
  }

  function closePanels() {
    setSidebarOpen(false);
    setRightOpen(false);
  }

  /* ── Loading screens ─────────────────────────────────────────────── */
  if (authLoading) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg)" }}>
      <span className="spinner" style={{ width: 24, height: 24, color: "var(--text-3)" }} />
    </div>
  );
  if (!user) return null;

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{ display: "flex", height: "100dvh", overflow: "hidden",
        background: "var(--bg)", position: "relative" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(13,14,20,0.88)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(6px)", gap: 16 }}>
          <div style={{ border: "2px dashed var(--accent)", borderRadius: "var(--radius-xl)",
            padding: "64px 96px", textAlign: "center", background: "rgba(232,255,71,0.04)" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16, opacity: 0.8 }}>⬆</div>
            <p className="font-display" style={{ fontSize: "1.6rem", color: "var(--accent)", marginBottom: 8 }}>
              Drop to upload
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "0.9375rem" }}>PDF files only</p>
          </div>
        </div>
      )}

      {mobilePanelOpen && (
        <button
          aria-label="Close open panel"
          onClick={closePanels}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 29,
            border: "none",
            background: "rgba(5,7,12,0.58)",
            backdropFilter: "blur(6px)",
            cursor: "pointer",
          }}
        />
      )}

      {/* ══ LEFT SIDEBAR ═════════════════════════════════════════════ */}
      {sidebarOpen && (
        <aside style={{
          width: isMobile ? "min(86vw, 320px)" : 264,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...(isMobile
            ? {
                position: "fixed",
                inset: "0 auto 0 0",
                zIndex: 30,
                boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
              }
            : {}),
        }}>

          <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <LogoMark size={30} />
            <button className="btn btn-icon" onClick={() => setSidebarOpen(false)}
              title="Collapse" style={{ width: 30, height: 30 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </button>
          </div>

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
            {docsLoading ? (
              /* Skeleton while restoring */
              <div style={{ padding: "14px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ height: 48, borderRadius: "var(--radius)",
                    background: "var(--bg-3)", opacity: 0.6 }} />
                ))}
              </div>
            ) : docs.length === 0 ? (
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
                    onClick={() => {
                      setActiveDocId(doc.id);
                      setRightTab("topics");
                      if (isMobile) setSidebarOpen(false);
                    }}
                    onDelete={() => handleDeleteDoc(doc.id)}
                  />
                ))}
              </>
            )}
          </div>

          {/* User footer */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)",
              color: "#0d0e14", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.8125rem", fontWeight: 600, flexShrink: 0 }}>
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
              {signingOut ? (
                <span className="spinner" style={{ width: 13, height: 13 }} />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 2.5H3.75A1.25 1.25 0 0 0 2.5 3.75v8.5A1.25 1.25 0 0 0 3.75 13.5H6" />
                  <path d="M10 5.25 13.25 8 10 10.75" />
                  <path d="M6.5 8h6.25" />
                </svg>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* ══ CENTER CHAT ══════════════════════════════════════════════ */}
      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
        width: isMobile ? "100%" : undefined,
      }}>

        <header style={{ minHeight: 54, flexShrink: 0, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", padding: isMobile ? "10px 12px" : "0 18px", gap: 10, background: "var(--bg-2)" }}>
          {!sidebarOpen && !isMobile && (
            <button className="btn btn-icon" onClick={openSidebar} title="Open sidebar">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5" />
              </svg>
            </button>
          )}
          {isMobile && (
            <button className="btn btn-ghost" onClick={openSidebar}
              style={{ fontSize: "0.8125rem", padding: "7px 10px", color: "var(--text)" }}>
              Docs
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
                {activeDoc.courseOutline && !isMobile && (
                  <span style={{ fontSize: "0.6875rem", color: "var(--accent)",
                    background: "rgba(232,255,71,0.1)", border: "1px solid rgba(232,255,71,0.2)",
                    borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
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
            {chatLoading && streamAbort.current && (
              <button className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", padding: "6px 12px", color: "var(--accent)" }}
                onClick={handleStopStream}>
                ◼ Stop
              </button>
            )}
            {msgs.length > 1 && !chatLoading && (
              <button className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", padding: "6px 12px" }}
                onClick={() => {
                  setMsgs(INITIAL_MESSAGES);
                  if (user) saveChat(user.uid, INITIAL_MESSAGES);
                }}>
                Clear chat
              </button>
            )}
            {isMobile ? (
              <button className="btn btn-ghost" onClick={openRightPanel}
                style={{ fontSize: "0.8125rem", padding: "7px 10px", color: "var(--text)" }}>
                Study
              </button>
            ) : !rightOpen && (
              <button className="btn btn-icon" onClick={openRightPanel} title="Open panel">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 2l-5 5 5 5" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "18px 12px 14px" : "28px 24px",
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
          <div style={{ padding: isMobile ? "0 12px 14px" : "0 24px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Summarise this document", "Explain the main concepts simply",
              "What should I know?", "Quiz me on this"].map(prompt => (
              <button key={prompt} className="btn btn-outline"
                style={{ fontSize: "0.8125rem", padding: "8px 14px" }}
                onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ borderTop: "1px solid var(--border)", padding: isMobile ? "12px" : "14px 20px", background: "var(--bg-2)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end",
            background: "var(--bg-3)", border: "1px solid var(--border-2)",
            borderRadius: "var(--radius-lg)", padding: isMobile ? "8px 8px 8px 12px" : "10px 10px 10px 16px" }}>
            <input type="file" multiple accept=".pdf,application/pdf"
              style={{ display: "none" }} id="chat-file"
              onChange={e => e.target.files && handleFiles(e.target.files)} />
            <label htmlFor="chat-file" title="Attach file"
              style={{ color: "var(--text-3)", cursor: "pointer", fontSize: "1.25rem",
                lineHeight: 1, paddingBottom: 7, flexShrink: 0, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>⊕</label>
            <textarea ref={textareaRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} disabled={chatLoading}
              placeholder={
                readyDocs.length > 0
                  ? `Ask anything about ${readyDocs.length === 1 ? `"${readyDocs[0].name}"` : `your ${readyDocs.length} documents`}…`
                  : "Upload a document first…"
              }
              rows={1}
              style={{ flex: 1, background: "none", border: "none", outline: "none",
                fontFamily: "var(--font-chat)", fontSize: "0.975rem", color: "var(--text)",
                resize: "none", lineHeight: 1.6, minHeight: 28, maxHeight: 160 }} />
            <button onClick={sendMessage} disabled={!input.trim() || chatLoading}
              style={{ width: isMobile ? "5.2vh" : "4.4vh", height: isMobile ? "5.2vh" : "4.4vh", flexShrink: 0,
                background: input.trim() && !chatLoading ? "var(--accent)" : "var(--bg-4)",
                border: "none", borderRadius: "var(--radius)",
                cursor: input.trim() && !chatLoading ? "pointer" : "default",
                color: input.trim() && !chatLoading ? "#0d0e14" : "var(--text-3)",
                fontSize: "1.05rem", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s" }}>
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

      {/* ══ RIGHT PANEL ══════════════════════════════════════════════ */}
      {rightOpen && (
        <aside style={{
          width: isMobile ? "min(92vw, 360px)" : 320,
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...(isMobile
            ? {
                position: "fixed",
                inset: "0 0 0 auto",
                zIndex: 30,
                boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
              }
            : {}),
        }}>

          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 8 }}>
            <div className="tab-bar" style={{ flex: 1 }}>
              {(["topics"] as RightTab[]).map(t => (
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

          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px" }}>
            {!activeDoc ? (
              <EmptyState icon="📄" title="No document selected"
                desc="Select or upload a document to see its course outline." />
            ) : activeDoc.status !== "ready" ? (
              <ProcessingState status={activeDoc.status} progress={activeDoc.progress} name={activeDoc.name} />
            ) : (
              <>
                {rightTab === "topics" && <TopicsPanel doc={activeDoc} onStartTutor={handleStartTutor} />}
                {/* rightTab === "summary"   && <SummaryPanel doc={activeDoc} /> */}
                {/* rightTab === "keypoints" && <KeyPointsPanel doc={activeDoc} /> */}
                {/* rightTab === "qa"        && <QAPanel doc={activeDoc} onAsk={...} /> */}
              </>
            )}
          </div>

          {!isMobile && (
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
              <div className="dropzone" style={{ padding: "22px 16px" }}
                onClick={() => fileInputRef.current?.click()}>
                <p style={{ fontSize: "0.875rem", color: "var(--text-3)", lineHeight: 1.6 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>Click</span> or drag & drop
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 4 }}>PDF files only</p>
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
