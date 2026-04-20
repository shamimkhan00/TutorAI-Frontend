"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { signInWithCustomToken } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { LogoMark } from "../sign-in/page";

type Step = "form" | "otp";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep]            = useState<Step>("form");
  const [email, setEmail]          = useState("");
  const [password, setPassword]    = useState("");
  const [confirmPass, setConfirm]  = useState("");
  const [challengeToken, setToken] = useState("");
  const [otp, setOtp]              = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState("");
  const [showPass, setShowPass]    = useState(false);

  /* ── Step 1: send OTP ─────────────────────────────────────────────── */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPass) { setError("Passwords do not match."); return; }
    if (password.length < 8)      { setError("Password must be at least 8 characters."); return; }
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

  /* ── Step 2: verify OTP ───────────────────────────────────────────── */
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length < 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code, challengeToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      await signInWithCustomToken(auth, data.customToken);
      router.replace("/dashboard");
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
          <p style={{ color: "var(--text-3)", fontSize: "0.9rem", marginTop: 10 }}>
            Your AI-powered learning assistant
          </p>
        </div>

        <div className="auth-card">

          {step === "form" ? (
            <>
              <StepBar step={1} total={2} />
              <h1 className="font-display"
                style={{ fontSize: "2rem", letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 6 }}>
                Create account
              </h1>
              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", marginBottom: 34, lineHeight: 1.5 }}>
                Start learning smarter today
              </p>

              <form onSubmit={handleSendOtp}>
                <FieldGroup label="Email address">
                  <input
                    className="input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} required
                  />
                </FieldGroup>

                <FieldGroup label="Password">
                  <div style={{ position: "relative" }}>
                    <input
                      className="input"
                      type={showPass ? "text" : "password"}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{ paddingRight: 56 }}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)",
                        background:"none", border:"none", cursor:"pointer",
                        color:"var(--text-3)", fontSize:"0.8125rem", fontFamily:"var(--font-body)" }}>
                      {showPass ? "hide" : "show"}
                    </button>
                  </div>
                </FieldGroup>

                <FieldGroup label="Confirm password" style={{ marginBottom: 26 }}>
                  <input
                    className="input" type="password" placeholder="••••••••"
                    value={confirmPass} onChange={e => setConfirm(e.target.value)} required
                  />
                </FieldGroup>

                {error && <ErrorBanner message={error} />}

                <button className="btn btn-primary" type="submit" disabled={loading}
                  style={{ fontSize: "0.9375rem", padding: "14px 22px" }}>
                  {loading ? <><span className="spinner" /> Sending code…</> : "Continue →"}
                </button>
              </form>

              <div style={{ textAlign: "center", marginTop: 24, fontSize: "0.9375rem", color: "var(--text-2)" }}>
                Already have an account?{" "}
                <Link href="/sign-in" style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
                  Sign in
                </Link>
              </div>
            </>
          ) : (
            <>
              <StepBar step={2} total={2} />
              <h1 className="font-display"
                style={{ fontSize: "2rem", letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 6 }}>
                Check your email
              </h1>
              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", marginBottom: 34, lineHeight: 1.5 }}>
                We sent a 6-digit code to{" "}
                <span style={{ color: "var(--text)", fontWeight: 500 }}>{email}</span>
              </p>

              <form onSubmit={handleVerifyOtp}>
                <div style={{ marginBottom: 28 }}>
                  <label className="label" style={{ marginBottom: 14 }}>Verification code</label>
                  <OtpInput value={otp} onChange={setOtp} />
                </div>

                {error && <ErrorBanner message={error} />}

                <button className="btn btn-primary" type="submit" disabled={loading}
                  style={{ fontSize: "0.9375rem", padding: "14px 22px" }}>
                  {loading ? <><span className="spinner" /> Verifying…</> : "Verify & create account →"}
                </button>

                <button type="button"
                  onClick={() => { setStep("form"); setOtp(["","","","","",""]); setError(""); }}
                  style={{ width:"100%", marginTop:14, background:"none", border:"none",
                    color:"var(--text-3)", fontSize:"0.875rem", cursor:"pointer",
                    padding:"8px", fontFamily:"var(--font-body)" }}>
                  ← Use a different email
                </button>

                <ResendTimer
                  onResend={() => handleSendOtp({ preventDefault: () => {} } as React.FormEvent)}
                />
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/* ─── OTP Input ───────────────────────────────────────────────────────── */
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
    const next = [...value];
    text.split("").forEach((d, i) => { next[i] = d; });
    onChange(next);
    refs.current[Math.min(text.length, 5)]?.focus();
    e.preventDefault();
  }, [value, onChange]);

  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          className={`otp-input${digit ? " filled" : ""}`}
          type="text" inputMode="numeric" maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}

/* ─── Resend timer ────────────────────────────────────────────────────── */
function ResendTimer({ onResend }: { onResend: () => void }) {
  const [sec, setSec] = useState(30);
  const [sending, setSending] = useState(false);

  // countdown
  useState(() => {
    const id = setInterval(() => setSec(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  });

  async function handleResend() {
    setSending(true);
    await onResend();
    setSec(30);
    setSending(false);
  }

  return (
    <p style={{ textAlign:"center", marginTop:18, fontSize:"0.875rem", color:"var(--text-3)", lineHeight:1.5 }}>
      {sec > 0 ? (
        <>Resend code in <span style={{ color:"var(--text-2)", fontFamily:"var(--font-mono)" }}>{sec}s</span></>
      ) : (
        <>
          Didn't receive it?{" "}
          <button onClick={handleResend} disabled={sending}
            style={{ background:"none", border:"none", color:"var(--accent)",
              cursor:"pointer", fontFamily:"var(--font-body)", fontSize:"0.875rem" }}>
            {sending ? "Sending…" : "Resend"}
          </button>
        </>
      )}
    </p>
  );
}

/* ─── Shared helpers ──────────────────────────────────────────────────── */
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display:"flex", gap:5, marginBottom:24 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height: 3, flex: 1, borderRadius: 99,
          background: i < step ? "var(--accent)" : "var(--bg-4)",
          transition: "background 0.3s",
        }} />
      ))}
    </div>
  );
}

function FieldGroup({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom: 20, ...style }}>
      <label className="label">{label}</label>
      {children}
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
