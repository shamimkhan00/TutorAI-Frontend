import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

type CreateEmailOtpResult = {
  challengeToken: string;
  code: string;
  expiresInMinutes: number;
};

type VerifyEmailOtpResult =
  | { ok: true }
  | { ok: false; message: string };

type OtpPayload = {
  email: string;
  codeHash: string;
  exp: number;
};

const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getOtpSecret() {
  const raw =
    process.env.OTP_SECRET ??
    process.env.FIREBASE_PRIVATE_KEY ??
    process.env.SMTP_PASS ??
    "";
  // FIREBASE_PRIVATE_KEY in .env files often stores \n as a literal
  // backslash-n instead of a real newline, making the secret inconsistent
  // between invocations depending on how the env is loaded.
  return raw.replace(/\\n/g, "\n");
}

function ensureOtpSecret() {
  const secret = getOtpSecret();

  if (!secret) {
    throw new Error(
      "OTP secret is not configured. Set OTP_SECRET, or ensure FIREBASE_PRIVATE_KEY or SMTP_PASS is available.",
    );
  }

  return secret;
}

function hashCode(code: string) {
  return createHmac("sha256", ensureOtpSecret()).update(code).digest("hex");
}

function signPayload(payloadBase64: string) {
  return createHmac("sha256", ensureOtpSecret())
    .update(payloadBase64)
    .digest("base64url");
}

function encodePayload(payload: OtpPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(payloadBase64: string): OtpPayload | null {
  try {
    const json = Buffer.from(payloadBase64, "base64url").toString("utf8");
    return JSON.parse(json) as OtpPayload;
  } catch {
    return null;
  }
}

export function createEmailOtp(email: string): CreateEmailOtpResult {
  const normalizedEmail = normalizeEmail(email);
  const code = String(randomInt(100000, 1000000));
  const payload: OtpPayload = {
    email: normalizedEmail,
    codeHash: hashCode(code),
    exp: Date.now() + OTP_TTL_MS,
  };
  const payloadBase64 = encodePayload(payload);
  const signature = signPayload(payloadBase64);

  return {
    code,
    challengeToken: `${payloadBase64}.${signature}`,
    expiresInMinutes: Math.floor(OTP_TTL_MS / 60000),
  };
}

export function verifyEmailOtp(
  email: string,
  code: string,
  challengeToken: string,
): VerifyEmailOtpResult {
  if (!challengeToken) {
    return { ok: false, message: "OTP session is missing. Please request a new OTP." };
  }

  const dotIndex = challengeToken.indexOf(".");
  if (dotIndex === -1) {
    return { ok: false, message: "OTP session is invalid. Please request a new OTP." };
  }
  const payloadBase64 = challengeToken.slice(0, dotIndex);
  const signature = challengeToken.slice(dotIndex + 1);

  const expectedSignature = signPayload(payloadBase64);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { ok: false, message: "OTP session is invalid. Please request a new OTP." };
  }

  const payload = decodePayload(payloadBase64);

  if (!payload) {
    return { ok: false, message: "OTP session is invalid. Please request a new OTP." };
  }

  if (payload.exp <= Date.now()) {
    return { ok: false, message: "OTP expired. Please request a new OTP." };
  }

  if (payload.email !== normalizeEmail(email)) {
    return { ok: false, message: "OTP email does not match. Please request a new OTP." };
  }

  if (payload.codeHash !== hashCode(code.trim())) {
    return { ok: false, message: "Invalid OTP code." };
  }

  return { ok: true };
}
