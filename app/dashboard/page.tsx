"use client";

/**
 * app/dashboard/page.tsx
 * ──────────────────────
 * Protected 3-panel TutorAI dashboard.
 * - Auth guard: redirects to /sign-in if not logged in
 * - Left sidebar: document list, upload, user info
 * - Center: chat interface with streaming
 * - Right panel: Summary / Key Points / Q&A tabs
 *
 * API wiring points are marked ── BACKEND ──
 * All data is mock until your friend's backend is connected.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { LogoMark } from "../sign-in/page";

/* ═══ Types ══════════════════════════════════════════════════════════ */
type DocStatus = "uploading" | "processing" | "ready" | "error";
type DocType   = "pdf" | "image" | "text";
type RightTab  = "summary" | "keypoints" | "qa";
type MsgRole   = "user" | "assistant";

interface Doc {
  id: string;
  name: string;
  type: DocType;
  size: number;
  status: DocStatus;
  progress: number;
  summary?: string;
  keyPoints?: string[];
  qaList?: { q: string; a: string }[];
  extractedText?: string;
}

interface Msg {
  id: string;
  role: MsgRole;
  content: string;
  streaming?: boolean;
  citations?: { docName: string; page?: number; excerpt: string }[];
}

/* ═══ Mock data (remove once backend connected) ══════════════════════ */
const INIT_MSGS: Msg[] = [{
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm TutorAI — your personal study assistant.\n\nUpload a PDF, textbook, or set of notes and I'll help you:\n\n- **Understand** any topic with clear explanations\n- **Summarise** documents into digestible key points\n- **Answer questions** strictly based on your material\n- **Quiz you** to check your understanding\n\nUpload something to get started!",
}];

const MOCK_STREAM_RESPONSE = `Great question! Based on your document, here's a clear explanation:

**Backpropagation** is the algorithm that trains neural networks by computing how much each weight contributed to the error.

**How it works in 3 steps:**

1. **Forward pass** — Input flows through the network layer by layer, producing a prediction. A loss function then measures how wrong it was.

2. **Compute gradients** — Using the *chain rule* of calculus, the algorithm calculates how much each weight contributed to the error — working backwards from the output to the input.

3. **Update weights** — Each weight is nudged in the direction that reduces the loss, scaled by a learning rate.

**The key insight:** by reusing intermediate values computed during the forward pass, all gradients can be computed efficiently in a single backward sweep.

Think of it like this: if your answer on a test was wrong, backprop figures out *which specific things you learned* were responsible for the mistake, and corrects each one proportionally.`;

/* ═══ Utilities ══════════════════════════════════════════════════════ */
function uid()  { return Math.random().toString(36).slice(2, 9); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function fmtSize(b: number) {
  if (b < 1024) return b + " B";
  if (b < 1_048_576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1_048_576).toFixed(1) + " MB";
}
function getDocType(file: File): DocType {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/"))  return "image";
  return "text";
}

/* ─── Very simple markdown → HTML ───────────────────────────────────── */
function md(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/`(.+?)`/g,       "<code>$1</code>")
    .replace(/^### (.+)$/gm,   "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,    "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,     "<h1>$1</h1>")
    .replace(/^- (.+)$/gm,     "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .split("\n\n")
    .map(p => p.startsWith("<") ? p : `<p>${p}</p>`)
    .join("\n");
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuthUser();

  /* ── Auth guard ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/sign-in");
  }, [authLoading, user, router]);

  /* ── State ──────────────────────────────────────────────────────── */
  const [docs,        setDocs]        = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [msgs,        setMsgs]        = useState<Msg[]>(INIT_MSGS);
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

  /* ── Sign out ───────────────────────────────────────────────────── */
  async function handleSignOut() {
    setSigningOut(true);
    await signOut(auth);
    router.replace("/");
  }

  /* ── File upload ─────────────────────────────────────────────────── */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f =>
      f.type === "application/pdf" ||
      f.type.startsWith("image/") ||
      f.type.startsWith("text/")
    );
    if (!arr.length) return;

    for (const file of arr) {
      const id = uid();
      const newDoc: Doc = {
        id, name: file.name, type: getDocType(file),
        size: file.size, status: "uploading", progress: 0,
      };
      setDocs(prev => [...prev, newDoc]);
      setActiveDocId(id);
      setRightTab("summary");

      try {
        /* ── BACKEND: replace mock with real upload ──────────────────
           const formData = new FormData();
           formData.append("file", file);
           const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
             method: "POST", body: formData
           });
           const data = await res.json();
           // data should contain: { summary, key_points, extracted_text }
           setDocs(prev => prev.map(d => d.id === id ? {
             ...d, status: "ready", progress: 100,
             summary:       data.summary,
             keyPoints:     data.key_points,
             extractedText: data.extracted_text,
           } : d));
           ─────────────────────────────────────────────────────────── */

        // Mock upload progress
        for (let p = 15; p <= 85; p += 14) {
          await sleep(130);
          setDocs(prev => prev.map(d => d.id === id ? { ...d, progress: p } : d));
        }
        setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "processing", progress: 90 } : d));
        await sleep(700);

        // Mock processed result
        setDocs(prev => prev.map(d => d.id === id ? {
          ...d,
          status: "ready",
          progress: 100,
          summary: `This is a mock summary for "${file.name}". Once connected to your backend, the real extracted text and AI-generated summary will appear here. The document covers the main topic with several key concepts that are important to understand.`,
          keyPoints: [
            "Connect your backend to get real key points from the document",
            "The AI will extract the most important concepts automatically",
            "Each point will be clear and concise for easy studying",
            "You can ask questions about any of these points in the chat",
          ],
          qaList: [
            { q: "What is the main topic of this document?", a: "Connect your backend to get real Q&A pairs generated from the document content." },
            { q: "What are the key concepts covered?", a: "The AI will generate study-relevant questions and answers based on the actual text." },
          ],
        } : d));

        // Add a system message in chat
        setMsgs(prev => [...prev, {
          id: uid(), role: "assistant",
          content: `I've processed **${file.name}**. I've read through the entire document and I'm ready to help you understand it.\n\nYou can:\n- Ask me to explain any concept from it\n- Request a summary\n- Ask me to quiz you\n- Ask specific questions about the content`,
        }]);

      } catch {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "error" } : d));
      }
    }
  }, []);

  /* ── Drag & drop ─────────────────────────────────────────────────── */
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  /* ── Send message ────────────────────────────────────────────────── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput("");

    // Add user message
    setMsgs(prev => [...prev, { id: uid(), role: "user", content: text }]);
    setChatLoading(true);

    // Add AI placeholder
    const aiId = uid();
    setMsgs(prev => [...prev, { id: aiId, role: "assistant", content: "", streaming: true }]);

    try {
      /* ── BACKEND: replace mock stream with real API call ─────────────
         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             question: text,
             document_ids: readyDocs.map(d => d.id),
             // If your backend supports streaming (SSE), handle the stream.
             // Otherwise just await the full response:
           })
         });
         const data = await res.json();
         setMsgs(prev => prev.map(m => m.id === aiId
           ? { ...m, content: data.answer, streaming: false, citations: data.citations }
           : m
         ));
         ──────────────────────────────────────────────────────────────── */

      // Mock word-by-word streaming
      const words = MOCK_STREAM_RESPONSE.split(" ");
      let acc = "";
      for (const word of words) {
        await sleep(22 + Math.random() * 30);
        acc += (acc ? " " : "") + word;
        setMsgs(prev => prev.map(m => m.id === aiId ? { ...m, content: acc } : m));
      }
      setMsgs(prev => prev.map(m => m.id === aiId
        ? { ...m, streaming: false,
            citations: readyDocs.length > 0 ? [{
              docName: readyDocs[0].name,
              page: 7,
              excerpt: "Backpropagation computes gradients via the chain rule of calculus.",
            }] : [],
          }
        : m
      ));
    } catch {
      setMsgs(prev => prev.map(m => m.id === aiId
        ? { ...m, content: "Sorry, something went wrong. Please try again.", streaming: false }
        : m
      ));
    } finally {
      setChatLoading(false);
    }
  }, [input, chatLoading, readyDocs]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  /* ── Loading screen ──────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
        <span className="spinner" style={{ width:24, height:24, color:"var(--text-3)" }} />
      </div>
    );
  }
  if (!user) return null; // will redirect

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{ display:"flex", height:"100dvh", overflow:"hidden", background:"var(--bg)", position:"relative" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Global drag overlay ──────────────────────────────────── */}
      {dragging && (
        <div style={{
          position:"fixed", inset:0, zIndex:100,
          background:"rgba(13,14,20,0.88)",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          backdropFilter:"blur(6px)",
          gap:16,
        }}>
          <div style={{
            border:"2px dashed var(--accent)",
            borderRadius:"var(--radius-xl)",
            padding:"64px 96px",
            textAlign:"center",
            background:"rgba(232,255,71,0.04)",
          }}>
            <div style={{ fontSize:"3rem", marginBottom:16, opacity:0.8 }}>⬆</div>
            <p className="font-display" style={{ fontSize:"1.6rem", color:"var(--accent)", marginBottom:8 }}>
              Drop to upload
            </p>
            <p style={{ color:"var(--text-3)", fontSize:"0.9375rem" }}>PDF, images, or text files</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════════════════════════════ */}
      {sidebarOpen && (
        <aside style={{
          width:264, flexShrink:0,
          borderRight:"1px solid var(--border)",
          background:"var(--bg-2)",
          display:"flex", flexDirection:"column",
          overflow:"hidden",
        }}>
          {/* Logo row */}
          <div style={{
            padding:"18px 18px 14px",
            borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", justifyContent:"space-between",
          }}>
            <LogoMark size={30} />
            <button className="btn btn-icon" onClick={() => setSidebarOpen(false)}
              title="Collapse" style={{ width:30, height:30 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5"/>
              </svg>
            </button>
          </div>

          {/* Upload button */}
          <div style={{ padding:"14px 14px 8px" }}>
            <input
              ref={fileInputRef} type="file" multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
              style={{ display:"none" }}
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
            <button
              className="btn btn-outline"
              style={{ width:"100%", gap:8, fontSize:"0.875rem", padding:"10px 14px" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span style={{ fontSize:"1rem", lineHeight:1 }}>+</span>
              Upload document
            </button>
          </div>

          {/* Document list */}
          <div style={{ flex:1, overflowY:"auto", padding:"4px 10px" }}>
            {docs.length === 0 ? (
              <div style={{
                padding:"32px 16px",
                textAlign:"center",
                color:"var(--text-3)",
                fontSize:"0.875rem",
                lineHeight:1.7,
              }}>
                <div style={{ fontSize:"2rem", marginBottom:10, opacity:0.3 }}>📂</div>
                No documents yet.<br />
                Upload a PDF or image<br />to start learning.
              </div>
            ) : (
              <>
                <p style={{
                  fontSize:"0.6875rem", fontWeight:600,
                  letterSpacing:"0.07em", textTransform:"uppercase",
                  color:"var(--text-3)", padding:"10px 4px 6px",
                }}>
                  Documents ({docs.length})
                </p>
                {docs.map(doc => (
                  <SidebarDocItem
                    key={doc.id}
                    doc={doc}
                    active={doc.id === activeDocId}
                    onClick={() => { setActiveDocId(doc.id); setRightTab("summary"); }}
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
          <div style={{
            borderTop:"1px solid var(--border)",
            padding:"14px 16px",
            display:"flex", alignItems:"center", gap:10,
          }}>
            <div style={{
              width:32, height:32, borderRadius:"50%",
              background:"var(--accent)", color:"#0d0e14",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"0.8125rem", fontWeight:600, flexShrink:0,
            }}>
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{
                fontSize:"0.8125rem", color:"var(--text)", fontWeight:500,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              }}>
                {user.email}
              </p>
            </div>
            <button
              className="btn btn-ghost"
              style={{ padding:"5px 8px", fontSize:"0.75rem", flexShrink:0 }}
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign out"
            >
              {signingOut ? <span className="spinner" style={{ width:13, height:13 }} /> : "↩"}
            </button>
          </div>
        </aside>
      )}

      {/* ════════════════════════════════════════════════════════════
          CENTER: CHAT
      ══════════════════════════════════════════════════════════════ */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* Top bar */}
        <header style={{
          height:54, flexShrink:0,
          borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center",
          padding:"0 18px", gap:10,
          background:"var(--bg-2)",
        }}>
          {!sidebarOpen && (
            <button className="btn btn-icon" onClick={() => setSidebarOpen(true)} title="Open sidebar">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5"/>
              </svg>
            </button>
          )}

          <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10 }}>
            {activeDoc ? (
              <>
                <span style={{ fontSize:"1rem", lineHeight:1 }}>{docIcon(activeDoc.type)}</span>
                <span style={{
                  fontSize:"0.875rem", color:"var(--text-2)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>
                  {activeDoc.name}
                </span>
                <StatusBadge status={activeDoc.status} />
              </>
            ) : (
              <span style={{ fontSize:"0.875rem", color:"var(--text-3)" }}>
                {docs.length === 0 ? "Upload a document to begin" : "Select a document from the sidebar"}
              </span>
            )}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {msgs.length > 1 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize:"0.8125rem", padding:"6px 12px" }}
                onClick={() => setMsgs(INIT_MSGS)}
              >
                Clear chat
              </button>
            )}
            {!rightOpen && (
              <button className="btn btn-icon" onClick={() => setRightOpen(true)} title="Open panel">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 2l-5 5 5 5"/>
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div style={{
          flex:1, overflowY:"auto",
          padding:"28px 24px",
          display:"flex", flexDirection:"column", gap:20,
        }}>
          {msgs.map(msg => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}
          {chatLoading && msgs[msgs.length-1]?.role === "user" && (
            <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
              <AiAvatar />
              <div className="bubble-ai" style={{ padding:"14px 18px" }}>
                <div className="typing-dots"><span/><span/><span/></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested prompts (shown when no real messages yet) */}
        {msgs.length === 1 && readyDocs.length > 0 && (
          <div style={{
            padding:"0 24px 16px",
            display:"flex", gap:8, flexWrap:"wrap",
          }}>
            {[
              "Summarise this document for me",
              "Explain the main concepts simply",
              "What are the key things I should know?",
              "Quiz me on this material",
            ].map(prompt => (
              <button
                key={prompt}
                className="btn btn-outline"
                style={{ fontSize:"0.8125rem", padding:"8px 14px" }}
                onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div style={{
          borderTop:"1px solid var(--border)",
          padding:"14px 20px",
          background:"var(--bg-2)",
        }}>
          <div style={{
            display:"flex", gap:10, alignItems:"flex-end",
            background:"var(--bg-3)",
            border:"1px solid var(--border-2)",
            borderRadius:"var(--radius-lg)",
            padding:"10px 10px 10px 16px",
          }}>
            {/* File attach */}
            <input
              type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
              style={{ display:"none" }} id="chat-file"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
            <label htmlFor="chat-file" title="Attach file"
              style={{
                color:"var(--text-3)", cursor:"pointer", fontSize:"1.25rem",
                lineHeight:1, paddingBottom:7, flexShrink:0,
                transition:"color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
            >⊕</label>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={chatLoading}
              placeholder={
                readyDocs.length > 0
                  ? `Ask anything about ${readyDocs.length === 1 ? `"${readyDocs[0].name}"` : `your ${readyDocs.length} documents`}…`
                  : "Upload a document first…"
              }
              rows={1}
              style={{
                flex:1, background:"none", border:"none", outline:"none",
                fontFamily:"var(--font-body)", fontSize:"0.9375rem",
                color:"var(--text)", resize:"none",
                lineHeight:1.6, paddingTop:6,
                minHeight:28, maxHeight:160,
              }}
            />

            {/* Send */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || chatLoading}
              style={{
                width:38, height:38, flexShrink:0,
                background: input.trim() && !chatLoading ? "var(--accent)" : "var(--bg-4)",
                border:"none",
                borderRadius:var_radius,
                cursor: input.trim() && !chatLoading ? "pointer" : "default",
                color: input.trim() && !chatLoading ? "#0d0e14" : "var(--text-3)",
                fontSize:"1.05rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.15s",
              }}
            >
              {chatLoading
                ? <span className="spinner" style={{ width:15, height:15 }} />
                : "↑"
              }
            </button>
          </div>

          <p style={{
            textAlign:"center",
            fontSize:"0.75rem",
            color:"var(--text-3)",
            marginTop:10,
            lineHeight:1.5,
          }}>
            TutorAI only answers based on your uploaded documents — no hallucinations.
          </p>
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════
          RIGHT PANEL
      ══════════════════════════════════════════════════════════════ */}
      {rightOpen && (
        <aside style={{
          width:320, flexShrink:0,
          borderLeft:"1px solid var(--border)",
          background:"var(--bg-2)",
          display:"flex", flexDirection:"column",
          overflow:"hidden",
        }}>
          {/* Tab bar */}
          <div style={{
            padding:"10px 12px",
            borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div className="tab-bar" style={{ flex:1 }}>
              {(["summary","keypoints","qa"] as RightTab[]).map(t => (
                <div
                  key={t}
                  className={`tab-item${rightTab===t?" active":""}`}
                  onClick={() => setRightTab(t)}
                >
                  {{ summary:"Summary", keypoints:"Key Points", qa:"Q & A" }[t]}
                </div>
              ))}
            </div>
            <button className="btn btn-icon"
              style={{ width:30, height:30, flexShrink:0 }}
              onClick={() => setRightOpen(false)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flex:1, overflowY:"auto", padding:"18px 16px" }}>
            {!activeDoc ? (
              <EmptyState
                icon="📄"
                title="No document selected"
                desc="Select or upload a document to see its summary, key points, and auto-generated Q&A."
              />
            ) : activeDoc.status !== "ready" ? (
              <ProcessingState status={activeDoc.status} progress={activeDoc.progress} name={activeDoc.name} />
            ) : (
              <>
                {rightTab === "summary"   && <SummaryPanel   doc={activeDoc} />}
                {rightTab === "keypoints" && <KeyPointsPanel doc={activeDoc} />}
                {rightTab === "qa"        && <QAPanel        doc={activeDoc} onAsk={q => { setInput(q); textareaRef.current?.focus(); }} />}
              </>
            )}
          </div>

          {/* Drop zone at bottom */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)" }}>
            <div
              className="dropzone"
              style={{ padding:"22px 16px" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <p style={{ fontSize:"0.875rem", color:"var(--text-3)", lineHeight:1.6 }}>
                <span style={{ color:"var(--accent)", fontWeight:500 }}>Click</span> or drag & drop a file
              </p>
              <p style={{ fontSize:"0.75rem", color:"var(--text-3)", marginTop:4 }}>
                PDF · Images · Text files
              </p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

// Workaround for CSS variable in style prop
const var_radius = "var(--radius)";

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════════════════════════ */

function AiAvatar() {
  return (
    <div style={{
      width:32, height:32, flexShrink:0,
      background:"var(--accent)",
      borderRadius:9,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-display)", fontSize:"0.85rem",
      color:"#0d0e14", fontWeight:700,
    }}>T</div>
  );
}

function ChatMessage({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="animate-fade-in"
      style={{
        display:"flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap:12,
        alignItems:"flex-end",
      }}
    >
      {!isUser && <AiAvatar />}
      <div style={{ maxWidth: isUser ? "72%" : "82%" }}>
        <div className={isUser ? "bubble-user" : "bubble-ai"}>
          {isUser ? (
            <span style={{ whiteSpace:"pre-wrap" }}>{msg.content}</span>
          ) : (
            <div
              className="ai-prose"
              dangerouslySetInnerHTML={{ __html: md(msg.content) }}
            />
          )}
          {/* Streaming cursor */}
          {msg.streaming && (
            <span style={{
              display:"inline-block", width:2, height:"1em",
              background: isUser ? "#0d0e14" : "var(--accent)",
              marginLeft:3, verticalAlign:"text-bottom",
              animation:"typingBounce 0.9s infinite",
            }} />
          )}
        </div>
        {/* Citations */}
        {msg.citations && msg.citations.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10 }}>
            {msg.citations.map((c, i) => (
              <span key={i} className="citation-chip" title={c.excerpt}>
                📄 {c.docName}{c.page ? ` · p.${c.page}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarDocItem({ doc, active, onClick, onDelete }: {
  doc: Doc; active: boolean;
  onClick: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`doc-item${active ? " active" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize:"1.05rem", lineHeight:1, flexShrink:0 }}>{docIcon(doc.type)}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{
          fontSize:"0.8125rem", color: active ? "var(--text)" : "var(--text-2)",
          fontWeight: active ? 500 : 400,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          marginBottom:3,
        }}>
          {doc.name}
        </p>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <StatusBadge status={doc.status} />
          {doc.status === "ready" && (
            <span style={{ fontSize:"0.6875rem", color:"var(--text-3)" }}>{fmtSize(doc.size)}</span>
          )}
        </div>
        {(doc.status === "uploading" || doc.status === "processing") && (
          <div className="progress-track" style={{ marginTop:5 }}>
            <div className="progress-fill" style={{ width: doc.progress + "%" }} />
          </div>
        )}
      </div>
      {hovered && doc.status !== "uploading" && doc.status !== "processing" && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            background:"none", border:"none", cursor:"pointer",
            color:"var(--text-3)", fontSize:"0.8rem",
            padding:"3px 5px", flexShrink:0,
            transition:"color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
        >✕</button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  const map = {
    ready:      { cls:"badge-ready",   label:"Ready" },
    processing: { cls:"badge-process", label:"Processing" },
    uploading:  { cls:"badge-upload",  label:"Uploading" },
    error:      { cls:"badge-error",   label:"Error" },
  };
  const { cls, label } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function SummaryPanel({ doc }: { doc: Doc }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(doc.summary ?? "").then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:14,
      }}>
        <p style={{
          fontSize:"0.75rem", fontWeight:600,
          letterSpacing:"0.06em", textTransform:"uppercase",
          color:"var(--text-3)",
        }}>AI Summary</p>
        <button className="btn btn-ghost"
          style={{ padding:"4px 10px", fontSize:"0.75rem" }}
          onClick={copy}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <p style={{
        fontSize:"0.9375rem", color:"var(--text-2)",
        lineHeight:1.75, wordBreak:"break-word",
      }}>
        {doc.summary ?? "No summary available yet."}
      </p>
    </div>
  );
}

function KeyPointsPanel({ doc }: { doc: Doc }) {
  const points = doc.keyPoints ?? [];
  if (!points.length) return (
    <EmptyState icon="•••" title="No key points" desc="Key points will appear after the document is processed." />
  );
  return (
    <div>
      <p style={{
        fontSize:"0.75rem", fontWeight:600, letterSpacing:"0.06em",
        textTransform:"uppercase", color:"var(--text-3)", marginBottom:14,
      }}>Key Points</p>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {points.map((kp, i) => (
          <div key={i} style={{
            display:"flex", gap:12,
            padding:"12px 14px",
            background:"var(--bg-3)",
            border:"1px solid var(--border)",
            borderRadius:"var(--radius)",
          }}>
            <span style={{
              width:22, height:22, flexShrink:0,
              background:"var(--accent-dim)",
              color:"var(--accent)",
              borderRadius:6,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"0.6875rem", fontFamily:"var(--font-mono)", fontWeight:600,
            }}>{i + 1}</span>
            <p style={{ fontSize:"0.875rem", color:"var(--text-2)", lineHeight:1.65 }}>{kp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QAPanel({ doc, onAsk }: { doc: Doc; onAsk: (q: string) => void }) {
  const qa = doc.qaList ?? [];
  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <p style={{
          fontSize:"0.75rem", fontWeight:600, letterSpacing:"0.06em",
          textTransform:"uppercase", color:"var(--text-3)", marginBottom:4,
        }}>Study Q&A</p>
        <p style={{ fontSize:"0.8125rem", color:"var(--text-3)", lineHeight:1.55 }}>
          Click a question to ask it in chat, or ask your own below.
        </p>
      </div>
      {qa.length === 0 ? (
        <EmptyState icon="?" title="No Q&A yet" desc="Q&A pairs will be generated once your backend is connected." />
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {qa.map((item, i) => (
            <div key={i} style={{
              background:"var(--bg-3)", border:"1px solid var(--border)",
              borderRadius:"var(--radius)", overflow:"hidden",
            }}>
              <button
                onClick={() => onAsk(item.q)}
                style={{
                  width:"100%", background:"none", border:"none",
                  cursor:"pointer", padding:"12px 14px",
                  textAlign:"left", display:"flex", alignItems:"flex-start", gap:8,
                  fontFamily:"var(--font-body)",
                }}
              >
                <span style={{
                  fontSize:"0.6875rem", color:"var(--accent)",
                  fontFamily:"var(--font-mono)", fontWeight:600,
                  background:"var(--accent-dim)", padding:"2px 6px",
                  borderRadius:4, flexShrink:0, marginTop:1,
                }}>Q</span>
                <span style={{ fontSize:"0.875rem", color:"var(--text)", lineHeight:1.55 }}>
                  {item.q}
                </span>
              </button>
              <div style={{
                padding:"10px 14px",
                borderTop:"1px solid var(--border)",
                display:"flex", gap:8,
              }}>
                <span style={{
                  fontSize:"0.6875rem", color:"var(--text-3)",
                  fontFamily:"var(--font-mono)", fontWeight:600,
                  background:"var(--bg-4)", padding:"2px 6px",
                  borderRadius:4, flexShrink:0, marginTop:1,
                }}>A</span>
                <p style={{ fontSize:"0.8125rem", color:"var(--text-2)", lineHeight:1.65 }}>
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

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 16px" }}>
      <div style={{ fontSize:"2rem", marginBottom:14, opacity:0.25 }}>{icon}</div>
      <p style={{ fontSize:"0.9375rem", fontWeight:500, color:"var(--text-2)", marginBottom:8 }}>{title}</p>
      <p style={{ fontSize:"0.875rem", color:"var(--text-3)", lineHeight:1.65 }}>{desc}</p>
    </div>
  );
}

function ProcessingState({ status, progress, name }: { status: DocStatus; progress: number; name: string }) {
  return (
    <div style={{ padding:"32px 8px" }}>
      <p style={{ fontSize:"0.875rem", color:"var(--text-2)", marginBottom:6 }}>
        {status === "uploading" ? "Uploading…" : "Reading document…"}
      </p>
      <p style={{ fontSize:"0.8125rem", color:"var(--text-3)", marginBottom:20, lineHeight:1.5 }}>
        {name}
      </p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: progress + "%" }} />
      </div>
      <p style={{
        textAlign:"right", fontSize:"0.75rem",
        color:"var(--text-3)", marginTop:6,
        fontFamily:"var(--font-mono)",
      }}>{progress}%</p>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function docIcon(type: DocType) {
  return { pdf:"📄", image:"🖼", text:"📝" }[type];
}
