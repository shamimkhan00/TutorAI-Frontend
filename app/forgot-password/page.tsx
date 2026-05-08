"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { signInWithCustomToken } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { LogoMark } from "@/app/components/logo-mark";

type Step = "email" | "otp" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep]            = useState<Step>("email");
  const [email, setEmail]          = useState("");
  const [newPassword, setNewPass]  = useState("");
  const [challengeToken, setToken] = useState("");
  const [otp, setOtp]              = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState("");
  const [showPass, setShowPass]    = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP.");
      setToken(data.challengeToken);
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length < 6)      { setError("Please enter all 6 digits."); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code, challengeToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      await signInWithCustomToken(auth, data.customToken);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="grid-texture"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="glow-blob" />
      <div className="glow-blob-2" />

      <div className="animate-fade-up" style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <LogoMark />
        </div>

        <div className="auth-card">

          {/* ── Step 1: Enter email ─────────────────────────────────── */}
          {step === "email" && (
            <>
              <Link href="/sign-in" style={{
                display:"inline-flex", alignItems:"center", gap:5,
                fontSize:"0.875rem", color:"var(--text-3)", textDecoration:"none", marginBottom:24,
                transition:"color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-2)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                ← Back to sign in
              </Link>
              <h1 className="font-display"
                style={{ fontSize:"2rem", letterSpacing:"-0.02em", lineHeight:1.15, marginBottom:6 }}>
                Reset password
              </h1>
              <p style={{ color:"var(--text-2)", fontSize:"0.9375rem", marginBottom:34, lineHeight:1.5 }}>
                Enter your email and we&apos;ll send a verification code.
              </p>
              <form onSubmit={handleSendOtp}>
                <div style={{ marginBottom:24 }}>
                  <label className="label">Email address</label>
                  <input className="input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                {error && <ErrorBanner message={error} />}
                <button className="btn btn-primary" type="submit" disabled={loading}
                  style={{ fontSize:"0.9375rem", padding:"14px 22px" }}>
                  {loading ? <><span className="spinner" /> Sending code…</> : "Send reset code →"}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2: OTP + new password ──────────────────────────── */}
          {step === "otp" && (
            <>
              <StepBar step={1} total={2} />
              <h1 className="font-display"
                style={{ fontSize:"2rem", letterSpacing:"-0.02em", lineHeight:1.15, marginBottom:6 }}>
                Verify & reset
              </h1>
              <p style={{ color:"var(--text-2)", fontSize:"0.9375rem", marginBottom:34, lineHeight:1.5 }}>
                Code sent to{" "}
                <span style={{ color:"var(--text)", fontWeight:500 }}>{email}</span>
              </p>
              <form onSubmit={handleVerify}>
                <div style={{ marginBottom:24 }}>
                  <label className="label" style={{ marginBottom:14 }}>Verification code</label>
                  <OtpInput value={otp} onChange={setOtp} />
                </div>
                <div style={{ marginBottom:26 }}>
                  <label className="label">New password</label>
                  <div style={{ position:"relative" }}>
                    <input className="input"
                      type={showPass ? "text" : "password"}
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={e => setNewPass(e.target.value)}
                      required
                      style={{ paddingRight:56 }}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)",
                        background:"none", border:"none", cursor:"pointer",
                        color:"var(--text-3)", fontSize:"0.8125rem", fontFamily:"var(--font-body)" }}>
                      {showPass ? "hide" : "show"}
                    </button>
                  </div>
                </div>
                {error && <ErrorBanner message={error} />}
                <button className="btn btn-primary" type="submit" disabled={loading}
                  style={{ fontSize:"0.9375rem", padding:"14px 22px" }}>
                  {loading ? <><span className="spinner" /> Updating…</> : "Reset password →"}
                </button>
                <button type="button"
                  onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); }}
                  style={{ width:"100%", marginTop:14, background:"none", border:"none",
                    color:"var(--text-3)", fontSize:"0.875rem", cursor:"pointer",
                    padding:"8px", fontFamily:"var(--font-body)" }}>
                  ← Back
                </button>
              </form>
            </>
          )}

          {/* ── Step 3: Success ─────────────────────────────────────── */}
          {step === "done" && (
            <div style={{ textAlign:"center", padding:"16px 0" }}>
              <div style={{
                width:64, height:64,
                background:"rgba(79,255,176,0.08)",
                border:"1px solid rgba(79,255,176,0.2)",
                borderRadius:"50%",
                display:"flex", alignItems:"center", justifyContent:"center",
                margin:"0 auto 24px",
                fontSize:"1.75rem",
              }}>✓</div>
              <h1 className="font-display"
                style={{ fontSize:"1.9rem", letterSpacing:"-0.02em", marginBottom:10 }}>
                Password updated
              </h1>
              <p style={{ color:"var(--text-2)", fontSize:"0.9375rem", marginBottom:32, lineHeight:1.6 }}>
                Your password has been changed and you&apos;re now signed in.
              </p>
              <button className="btn btn-primary" onClick={() => router.replace("/dashboard")}
                style={{ fontSize:"0.9375rem", padding:"14px 22px" }}>
                Go to dashboard →
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

/* ─── Shared ──────────────────────────────────────────────────────────── */
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display:"flex", gap:5, marginBottom:24 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height:3, flex:1, borderRadius:99,
          background: i < step ? "var(--accent)" : "var(--bg-4)",
          transition:"background 0.3s",
        }} />
      ))}
    </div>
  );
}

function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const handleKey = useCallback((i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  }, [value]);
  const handleChange = useCallback((i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...value]; next[i] = digit; onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  }, [value, onChange]);
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...value]; text.split("").forEach((d, i) => { next[i] = d; }); onChange(next);
    refs.current[Math.min(text.length, 5)]?.focus(); e.preventDefault();
  }, [value, onChange]);
  return (
    <div style={{ display:"flex", gap:10, justifyContent:"space-between" }}>
      {value.map((digit, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }}
          className={`otp-input${digit ? " filled" : ""}`}
          type="text" inputMode="numeric" maxLength={1}
          value={digit} onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)} onPaste={handlePaste} />
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      background:"rgba(255,94,94,0.07)", border:"1px solid rgba(255,94,94,0.2)",
      borderRadius:"var(--radius)", padding:"12px 16px", marginBottom:18,
      fontSize:"0.875rem", color:"var(--danger)",
      display:"flex", gap:10, alignItems:"flex-start", lineHeight:1.5,
    }}>
      <span style={{ fontSize:"1rem", flexShrink:0 }}>⚠</span>
      <span>{message}</span>
    </div>
  );
}
