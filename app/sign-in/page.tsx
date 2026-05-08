"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, type AuthError } from "firebase/auth";

import { LogoMark } from "@/app/components/logo-mark";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { auth } from "@/lib/firebase";

export default function SignInPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuthUser();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  // ── BUG FIX: was redirecting to "/" (home) — changed to "/dashboard" ──
  // Previously caused a loop: sign-in → sees user → goes to "/" → home
  // has sign-in link → clicks → already authed → redirected back to "/"
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const authError = err as AuthError;
      // Show friendlier messages instead of raw Firebase codes
      const msg = friendlyError(authError.code);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Show loading screen while Firebase restores session — avoids flash
  if (authLoading) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <span className="spinner" style={{ width: 22, height: 22, color: "var(--text-3)" }} />
      </div>
    );
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

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <LogoMark />
          <p style={{ color: "var(--text-3)", fontSize: "0.9rem", marginTop: 10, letterSpacing: "0.01em" }}>
            Your AI-powered learning assistant
          </p>
        </div>

        <div className="auth-card">
          <h1
            className="font-display"
            style={{ fontSize: "2rem", marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Welcome back
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", marginBottom: 34, lineHeight: 1.5 }}>
            Sign in to continue learning
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <FieldGroup label="Email address">
              <input
                className={`input${error ? " error" : ""}`}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </FieldGroup>

            <FieldGroup label="Password" style={{ marginBottom: 8 }}>
              <div style={{ position: "relative" }}>
                <input
                  className={`input${error ? " error" : ""}`}
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 56 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: "absolute", right: 14, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-3)", fontSize: "0.8125rem", padding: "2px 4px",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {showPass ? "hide" : "show"}
                </button>
              </div>
            </FieldGroup>

            <div style={{ textAlign: "right", marginBottom: 24 }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: "0.8125rem", color: "var(--text-3)",
                  textDecoration: "none", transition: "color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                Forgot password?
              </Link>
            </div>

            {error && <ErrorBanner message={error} />}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || authLoading}
              style={{ fontSize: "0.9375rem", padding: "14px 22px" }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 17, height: 17 }} /> Signing in…</>
                : "Sign in →"
              }
            </button>
          </form>

          <div className="divider" style={{ margin: "28px 0" }}>or</div>

          <p style={{ textAlign: "center", fontSize: "0.9375rem", color: "var(--text-2)" }}>
            New here?{" "}
            <Link href="/sign-up" style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
              Create account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function friendlyError(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

/* ─── Sub-components ──────────────────────────────────────────────────── */
function FieldGroup({
  label, children, style,
}: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
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
      background: "rgba(255,94,94,0.07)",
      border: "1px solid rgba(255,94,94,0.2)",
      borderRadius: "var(--radius)",
      padding: "12px 16px",
      marginBottom: 18,
      fontSize: "0.875rem",
      color: "var(--danger)",
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      lineHeight: 1.5,
    }}>
      <span style={{ fontSize: "1rem", flexShrink: 0 }}>⚠</span>
      <span>{message}</span>
    </div>
  );
}

<<<<<<< HEAD
=======
export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      <div style={{
        width: size, height: size,
        background: "var(--accent)", // Background color can remain, or you can remove it
        borderRadius: Math.round(size * 0.25) + "px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.44 + "px",
        fontFamily: "var(--font-display)",
        color: "#0d0e14",
        fontWeight: 500,
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}>
        <img
          src="/favicon.webp" // Path to your image in the public folder
          alt="Custom Icon"
          style={{
            width: size * 0.8, // Adjust the size of the image
            height: size * 0.8, // Match the size
            borderRadius: "50%", // Make the image round (if it's not square, this will clip it)
          }}
        />
      </div>
      <span style={{
        fontFamily: "'Poppins'",
        fontSize: size * 0.66 + "px",
        letterSpacing: "-0.025em",
        color: "var(--text)",
        lineHeight: 1,
      }}>TutorAI</span>
    </div>
  );
}
>>>>>>> 2f7cd6330bee103beb4383a9377854c6cb123f2c
