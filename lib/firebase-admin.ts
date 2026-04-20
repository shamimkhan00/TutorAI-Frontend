import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getRequiredAdminEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set.`);
  }

  return value;
}

function normalizePrivateKey(value: string) {
  let normalized = value.trim();

  if (normalized.endsWith(",")) {
    normalized = normalized.slice(0, -1).trimEnd();
  }

  if (
    (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  return normalized.replace(/\\n/g, "\n");
}

const projectId = getRequiredAdminEnv("FIREBASE_PROJECT_ID");
const clientEmail = getRequiredAdminEnv("FIREBASE_CLIENT_EMAIL");
const privateKey = normalizePrivateKey(
  getRequiredAdminEnv("FIREBASE_PRIVATE_KEY"),
);

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });

const adminAuth = getAuth(adminApp);

export { adminApp, adminAuth };
