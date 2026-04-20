import { NextResponse } from "next/server";

import { verifyEmailOtp } from "@/lib/email-otp-store";
import { adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type AdminErrorDetails = {
  message: string;
  status: number;
};

function mapFirebaseAdminError(error: unknown): AdminErrorDetails {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/email-already-exists":
        return {
          message: "An account already exists for this email.",
          status: 400,
        };
      case "auth/invalid-password":
        return {
          message: "Password must meet Firebase requirements.",
          status: 400,
        };
      case "auth/invalid-email":
        return {
          message: "Please enter a valid email address.",
          status: 400,
        };
      default:
        return {
          message: error.code,
          status: 500,
        };
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: 500,
    };
  }

  return {
    message: "Unable to create account.",
    status: 500,
  };
}

export async function POST(request: Request) {
  try {
    const {
      email,
      password,
      otp,
      challengeToken,
    } = (await request.json()) as {
      email?: string;
      password?: string;
      otp?: string;
      challengeToken?: string;
    };

    if (!email || !password || !otp || !challengeToken) {
      return NextResponse.json(
        { message: "Email, password, OTP, and OTP session are required." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const verified = verifyEmailOtp(normalizedEmail, otp, challengeToken);

    if (!verified.ok) {
      return NextResponse.json({ message: verified.message }, { status: 400 });
    }

    const userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password,
      emailVerified: true,
    });

    const customToken = await adminAuth.createCustomToken(userRecord.uid);

    return NextResponse.json({
      message: "Signup completed successfully.",
      userId: userRecord.uid,
      email: userRecord.email,
      customToken,
    });
  } catch (error) {
    // console.error("VERIFY ERROR:", error);
    const details = mapFirebaseAdminError(error);

    return NextResponse.json(
      { message: details.message },
      { status: details.status },
    );
  }
}
