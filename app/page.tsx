"use client";

/**
 * app/page.tsx
 * ─────────────
 * Landing page. Uses your existing SignedIn / SignedOut components.
 * Signed-in users see a "Go to dashboard" button.
 * Signed-out users see sign-in / create account.
 */

import { useRouter } from "next/navigation";
import { LogoMark } from "./components/logo-mark";
import { SignedIn }  from "./components/signed-in";
import { SignedOut } from "./components/signed-out";

export default function HomePage() {
  const router = useRouter();

  return (
    <main
      className="grid-texture"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
        flexDirection: "column",
        gap: 48,
      }}
    >
      <div className="glow-blob" />
      <div className="glow-blob-2" />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="animate-fade-up" style={{ textAlign: "center", maxWidth: 600, zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}>
          <LogoMark size={46} />
        </div>

        <h1
          className="font-display"
          style={{
            fontSize: "clamp(2.4rem, 5.5vw, 3.6rem)",
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            marginBottom: 20,
            color: "var(--text)",
          }}
        >
          Learn anything,<br />
          <span style={{ color: "var(--accent)" }}>actually understand it.</span>
        </h1>

        <p style={{
          fontSize: "1.0625rem",
          color: "var(--text-2)",
          lineHeight: 1.75,
          maxWidth: 460,
          margin: "0 auto 40px",
        }}>
          Upload your notes, textbooks, or slides.
          Ask questions, get clear summaries, and let AI teach you like a real tutor —
          without ever making things up.
        </p>

        {/* Auth-aware CTA buttons */}
        <SignedIn>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              className="btn btn-primary"
              style={{ width: "auto", padding: "14px 32px", fontSize: "1rem" }}
              onClick={() => router.push("/dashboard")}
            >
              Go to dashboard →
            </button>
          </div>
        </SignedIn>

        <SignedOut>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              style={{ width: "auto", padding: "14px 32px", fontSize: "1rem" }}
              onClick={() => router.push("/sign-in")}
            >
              Sign in →
            </button>
            <button
              className="btn btn-outline"
              style={{ padding: "14px 32px", fontSize: "1rem" }}
              onClick={() => router.push("/sign-up")}
            >
              Create free account
            </button>
          </div>
        </SignedOut>
      </div>

      {/* ── Feature cards ─────────────────────────────────────────── */}
      <div
        className="animate-fade-up"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          maxWidth: 680,
          width: "100%",
          zIndex: 1,
          animationDelay: "0.08s",
        }}
      >
        {FEATURES.map(f => (
          <div key={f.title} className="card" style={{ padding: "20px 18px" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{f.icon}</div>
            <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", marginBottom: 5 }}>
              {f.title}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: 1.6 }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}

const FEATURES = [
  { icon: "📄", title: "Upload documents",  desc: "PDF, images, or plain text — TutorAI reads it all." },
  { icon: "💬", title: "Ask anything",       desc: "Get answers that come directly from your material." },
  { icon: "✦",  title: "Auto summaries",     desc: "Key points extracted and explained simply." },
  { icon: "🎓", title: "Real tutoring",       desc: "AI explains concepts, not just quotes text." },
];
