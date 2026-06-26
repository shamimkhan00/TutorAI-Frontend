// lib/payments.ts
import { backendUrl } from "@/lib/api";

export interface CreateOrderResponse {
  success: true;
  orderId: string;
  paymentSessionId: string;
  amount: number;
  purpose: "subscription" | "credits";
  refId: string;
}

export interface OrderStatusResponse {
  success: true;
  orderId: string;
  status: "pending" | "paid" | "failed";
  purpose: string;
  amount: number;
}

export interface CustomerDetails {
  email: string;
  phone: string;
  name?: string;
}

export async function createPaymentOrder(
  token: string,
  args:
    | { purpose: "subscription"; planId: string; customer: CustomerDetails }
    | { purpose: "credits"; packId: string; customer: CustomerDetails }
): Promise<CreateOrderResponse> {
  const res = await fetch(backendUrl("/api/payments/create-order"), {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify(args),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to create order: ${res.status}`);
  return data;
}

export async function getOrderStatus(
  token: string,
  orderId: string
): Promise<OrderStatusResponse> {
  const res = await fetch(backendUrl(`/api/payments/${encodeURIComponent(orderId)}/status`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to fetch order status: ${res.status}`);
  return data;
}

/**
 * Polls order status every `intervalMs` until it's no longer "pending" or
 * `timeoutMs` elapses. Used as a fallback while waiting for the webhook
 * to land (most webhooks arrive within 1-3 seconds, but this gives the
 * checkout page something to do besides spin forever).
 */
export async function pollOrderStatus(
  token: string,
  orderId: string,
  { intervalMs = 2000, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<OrderStatusResponse> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await getOrderStatus(token, orderId);
    if (result.status !== "pending") return result;
    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error("Payment status check timed out. Please check your payment history.");
}