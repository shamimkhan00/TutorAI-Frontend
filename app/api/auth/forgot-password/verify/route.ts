import { NextResponse } from "next/server";
import { verifyEmailOtp } from "@/lib/email-otp-store";
import { adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, newPassword, otp, challengeToken } =
      (await request.json()) as {
        email?: string;
        newPassword?: string;
        otp?: string;
        challengeToken?: string;
      };

    if (!email || !newPassword || !otp || !challengeToken) {
      return NextResponse.json(
        { message: "Email, new password, OTP, and OTP session are required." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const verified = verifyEmailOtp(normalizedEmail, otp, challengeToken);

    if (!verified.ok) {
      return NextResponse.json({ message: verified.message }, { status: 400 });
    }

    // Look up user by email
    const userRecord = await adminAuth.getUserByEmail(normalizedEmail);

    // Update their password
    await adminAuth.updateUser(userRecord.uid, { password: newPassword });

    // Sign them in via custom token
    const customToken = await adminAuth.createCustomToken(userRecord.uid);

    return NextResponse.json({
      message: "Password reset successfully.",
      customToken,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "auth/user-not-found"
    ) {
      // Don't reveal whether the email exists
      return NextResponse.json(
        { message: "Invalid OTP code." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to reset password.";
    return NextResponse.json({ message }, { status: 500 });
  }
}