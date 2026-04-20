import { NextResponse } from "next/server";

import { createEmailOtp } from "@/lib/email-otp-store";
import { sendSignupOtpEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };

    if (!email || !email.trim()) {
      return NextResponse.json(
        { message: "Email is required." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { code, challengeToken, expiresInMinutes } = createEmailOtp(normalizedEmail);

    await sendSignupOtpEmail(normalizedEmail, code);

    return NextResponse.json({
      message: "OTP sent to your email address.",
      challengeToken,
      expiresInMinutes,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to send OTP email right now.";

    return NextResponse.json({ message }, { status: 500 });
  }
}
