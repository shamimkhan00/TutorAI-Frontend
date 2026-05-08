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
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { LogoMark } from "@/app/components/logo-mark";
import { AiAvatar, ChatMessage } from "./chat-message";
import { EmptyState } from "./empty-state";
import { KeyPointsPanel, QAPanel, SummaryPanel } from "./document-panels";
import { ProcessingState } from "./processing-state";
import { SidebarDocItem } from "./sidebar-doc-item";
import { StatusBadge } from "./status-badge";
import { createId, getDocIcon, getDocType, sleep } from "../_lib/dashboard-utils";
import { INITIAL_MESSAGES, MOCK_STREAM_RESPONSE } from "../_lib/mock-data";
import type { Doc, Msg, RightTab } from "../_types/dashboard";

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
      const id = createId();
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
          id: createId(), role: "assistant",
          content: `I've processed **${file.name}**. I've read through the entire document and I'm ready to help you understand it.\n\nYou can:\n- Ask me to explain any concept from it\n- Request a summary\n- Ask me to quiz you\n- Ask specific questions about the content`,
        }]);

      } catch {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "error" } : d));
      }
    }
  }, []);

  /* ── Drag & drop ─────────────────────────────────────────────────── */
  function handleDragOver(e: DragEvent) { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  /* ── Send message ────────────────────────────────────────────────── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput("");

    // Add user message
    setMsgs(prev => [...prev, { id: createId(), role: "user", content: text }]);
    setChatLoading(true);

    // Add AI placeholder
    const aiId = createId();
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

  function handleKeyDown(e: KeyboardEvent) {
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
                <span style={{ fontSize:"0.6875rem", fontFamily:"var(--font-mono)", lineHeight:1, color:"var(--accent)" }}>{getDocIcon(activeDoc.type)}</span>
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
                onClick={() => setMsgs(INITIAL_MESSAGES)}
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

