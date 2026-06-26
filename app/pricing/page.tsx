"use client";

/**
 * app/pricing/page.tsx
 *
 * Standalone pricing page, accessible at /pricing.
 * Loads the Cashfree Checkout JS SDK, creates an order via the backend,
 * then opens Cashfree's hosted checkout. Payment confirmation NEVER
 * happens on this page — the backend webhook is the only source of truth.
 * This page only polls for status after redirect to update the UI.
 */

import { useState, useEffect } from "react";
import Script from "next/script";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { createPaymentOrder } from "@/lib/payments";
import { backendUrl } from "@/lib/api";

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "production" | "sandbox" }) => {
      checkout: (opts: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown>;
    };
  }
}


const PLANS = [
  { id: "free",    label: "Free",        price: 0,   credits: "20 messages/day",     cta: "Current plan", purpose: null },
  { id: "student", label: "Student Pro", price: 199, credits: "500 messages/month",  cta: "Upgrade",       purpose: "subscription" as const },
  { id: "premium", label: "Premium",     price: 499, credits: "2000 messages/month", cta: "Upgrade",       purpose: "subscription" as const },
];

const CREDIT_PACKS = [
  { id: "extra_500", label: "Extra Credits", price: 99, credits: "+500 messages", purpose: "credits" as const },
];

async function fetchSavedPhone(token: string): Promise<string | null> {
  const res = await fetch(backendUrl("/api/users/phone"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.phone ?? null;
}

async function savePhone(token: string, phone: string): Promise<string> {
  const res = await fetch(backendUrl("/api/users/phone"), {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Invalid phone number.");
  return data.phone;
}

export default function PricingPage() {
  const { user, loading: authLoading } = useAuthUser();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [sdkReady,   setSdkReady]   = useState(false);

  // ── Phone collection state ────────────────────────────────────────
  const [savedPhone,   setSavedPhone]   = useState<string | null>(null);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [phoneModal,   setPhoneModal]   = useState<{ purpose: "subscription" | "credits"; refId: string } | null>(null);
  const [phoneInput,   setPhoneInput]   = useState("");
  const [phoneError,   setPhoneError]   = useState<string | null>(null);
  const [phoneSaving,  setPhoneSaving]  = useState(false);

  // Load saved phone once the user is known
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const phone = await fetchSavedPhone(token);
        setSavedPhone(phone);
      } finally {
        setPhoneChecked(true);
      }
    })();
  }, [authLoading, user]);

  async function handlePurchase(
    purpose: "subscription" | "credits",
    refId: string
  ) {
    setError(null);

    if (!user) {
      setError("Please sign in before purchasing a plan.");
      return;
    }
    if (!sdkReady || !window.Cashfree) {
      setError("Payment system is still loading — please try again in a moment.");
      return;
    }

    // ── Gate on phone number — Cashfree requires it, and your auth ──
    // doesn't currently collect one. Ask once, inline, then proceed.
    if (!savedPhone) {
      setPhoneInput("");
      setPhoneError(null);
      setPhoneModal({ purpose, refId });
      return;
    }

    await proceedToCheckout(purpose, refId, savedPhone);
  }

  async function proceedToCheckout(
    purpose: "subscription" | "credits",
    refId: string,
    phone: string
  ) {
    setLoadingId(refId);

    try {
      const token = await auth.currentUser!.getIdToken();

      const customer = {
        email: user!.email ?? "",
        phone,
        name:  user!.displayName ?? undefined,
      };

      const order = await createPaymentOrder(
        token,
        purpose === "subscription"
          ? { purpose: "subscription", planId: refId, customer }
          : { purpose: "credits",      packId: refId, customer }
      );

      const cashfree = window.Cashfree!({ mode: "production" });
      await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget:   "_self",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong starting checkout.");
      setLoadingId(null);
    }
  }

  async function handlePhoneSubmit() {
    if (!phoneModal) return;
    setPhoneError(null);
    setPhoneSaving(true);

    try {
      const token = await auth.currentUser!.getIdToken();
      const saved = await savePhone(token, phoneInput);
      setSavedPhone(saved);
      const { purpose, refId } = phoneModal;
      setPhoneModal(null);
      await proceedToCheckout(purpose, refId, saved);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Invalid phone number.");
    } finally {
      setPhoneSaving(false);
    }
  }

  return (
    <>
      <Script
        src="https://sdk.cashfree.com/js/v3/cashfree.js"
        onLoad={() => setSdkReady(true)}
        strategy="afterInteractive"
      />

      <main style={{
        minHeight: "100dvh", background: "var(--bg)", padding: "64px 24px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 48,
      }}>
        <div style={{ textAlign: "center", maxWidth: 560 }}>
          <h1 className="font-display" style={{
            fontSize: "clamp(2rem, 4.5vw, 2.8rem)", color: "var(--text)", marginBottom: 12,
          }}>
            Simple, transparent pricing
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: "1.0625rem", lineHeight: 1.6 }}>
            Pick a plan that fits how much you study. Upgrade, downgrade, or top up anytime.
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(255,94,94,0.1)", border: "1px solid rgba(255,94,94,0.3)",
            borderRadius: "var(--radius)", padding: "12px 18px", color: "var(--danger)",
            fontSize: "0.875rem", maxWidth: 480, textAlign: "center",
          }}>
            {error}
          </div>
        )}

        {/* Plans */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20, maxWidth: 920, width: "100%",
        }}>
          {PLANS.map(plan => (
            <div key={plan.id} className="card" style={{
              padding: "32px 28px", display: "flex", flexDirection: "column", gap: 16,
              border: plan.id === "student" ? "1px solid var(--accent)" : "1px solid var(--border)",
            }}>
              <div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  {plan.label}
                </p>
                <p className="font-display" style={{ fontSize: "2.2rem", color: "var(--text)" }}>
                  {plan.price === 0 ? "₹0" : `₹${plan.price}`}
                  {plan.price > 0 && <span style={{ fontSize: "1rem", color: "var(--text-3)" }}>/month</span>}
                </p>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>{plan.credits}</p>
              <button
                className={plan.purpose ? "btn btn-primary" : "btn btn-outline"}
                disabled={!plan.purpose || loadingId === plan.id || authLoading || !phoneChecked}
                onClick={() => plan.purpose && handlePurchase(plan.purpose, plan.id)}
                style={{ marginTop: "auto" }}
              >
                {loadingId === plan.id
                  ? <span className="spinner" style={{ width: 15, height: 15 }} />
                  : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Credit top-ups */}
        <div style={{ width: "100%", maxWidth: 920 }}>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, textAlign: "center" }}>
            Need more right now?
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {CREDIT_PACKS.map(pack => (
              <div key={pack.id} className="card" style={{
                padding: "20px 24px", display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 16,
              }}>
                <div>
                  <p style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9375rem" }}>{pack.label}</p>
                  <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{pack.credits} · ₹{pack.price}</p>
                </div>
                <button
                  className="btn btn-outline"
                  disabled={loadingId === pack.id || authLoading || !phoneChecked}
                  onClick={() => handlePurchase("credits", pack.id)}
                  style={{ padding: "9px 18px", fontSize: "0.875rem", whiteSpace: "nowrap" }}
                >
                  {loadingId === pack.id
                    ? <span className="spinner" style={{ width: 14, height: 14 }} />
                    : "Buy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Phone collection modal — shown once, before first purchase ── */}
      {phoneModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(13,14,20,0.82)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, padding: "28px 26px" }}>
            <p style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              One quick thing
            </p>
            <p style={{ fontSize: "0.875rem", color: "var(--text-3)", lineHeight: 1.6, marginBottom: 18 }}>
              Cashfree requires a mobile number to process payments. We'll save it so you only need to enter it once.
            </p>

            <input
              className={`input${phoneError ? " error" : ""}`}
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
              autoFocus
              style={{ marginBottom: 8 }}
            />
            {phoneError && (
              <p style={{ color: "var(--danger)", fontSize: "0.8125rem", marginBottom: 10 }}>{phoneError}</p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setPhoneModal(null)}
                disabled={phoneSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, width: "auto" }}
                onClick={handlePhoneSubmit}
                disabled={phoneSaving || phoneInput.trim().length < 10}
              >
                {phoneSaving
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : "Continue to payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}