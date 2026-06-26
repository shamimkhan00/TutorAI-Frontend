"use client";

/**
 * app/pricing/result/page.tsx
 *
 * Cashfree redirects here after checkout (return_url) with ?order_id=...
 * This page polls the backend (which itself double-checks Cashfree if the
 * webhook hasn't landed yet) until the order resolves to paid/failed.
 * It NEVER trusts the redirect itself as proof of payment.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/app/hooks/use-auth-user";
import { pollOrderStatus } from "@/lib/payments";

type ResultState = "checking" | "paid" | "failed" | "error";

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<PaymentResultFallback />}>
      <PaymentResultContent />
    </Suspense>
  );
}

function PaymentResultFallback() {
  return (
    <main style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20, padding: 24,
      background: "var(--bg)", textAlign: "center",
    }}>
      <span className="spinner" style={{ width: 32, height: 32, color: "var(--accent)" }} />
      <p className="font-display" style={{ fontSize: "1.5rem", color: "var(--text)", maxWidth: 420 }}>
        Loading payment result…
      </p>
    </main>
  );
}

function PaymentResultContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const orderId = params.get("order_id");
  const [state, setState]   = useState<ResultState>("checking");
  const [message, setMessage] = useState("Confirming your payment…");

  useEffect(() => {
    if (authLoading || !user || !orderId) return;

    (async () => {
      try {
        const token  = await auth.currentUser!.getIdToken();
        const result = await pollOrderStatus(token, orderId, { intervalMs: 2000, timeoutMs: 45_000 });

        if (result.status === "paid") {
          setState("paid");
          setMessage("Payment confirmed! Your account has been updated.");
        } else {
          setState("failed");
          setMessage("This payment was not completed. No charge was applied.");
        }
      } catch (err) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not confirm payment status.");
      }
    })();
  }, [authLoading, user, orderId]);

  return (
    <main style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20, padding: 24,
      background: "var(--bg)", textAlign: "center",
    }}>
      {state === "checking" && (
        <span className="spinner" style={{ width: 32, height: 32, color: "var(--accent)" }} />
      )}
      {state === "paid"   && <div style={{ fontSize: "3rem" }}>✅</div>}
      {state === "failed" && <div style={{ fontSize: "3rem" }}>⚠️</div>}
      {state === "error"  && <div style={{ fontSize: "3rem" }}>❓</div>}

      <p className="font-display" style={{ fontSize: "1.5rem", color: "var(--text)", maxWidth: 420 }}>
        {message}
      </p>

      {state !== "checking" && (
        <button className="btn btn-primary" style={{ width: "auto", padding: "12px 28px" }}
          onClick={() => router.push(state === "paid" ? "/dashboard" : "/pricing")}>
          {state === "paid" ? "Go to dashboard" : "Back to pricing"}
        </button>
      )}
    </main>
  );
}