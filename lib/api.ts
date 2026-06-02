// lib/api.ts
import { auth } from "@/lib/firebase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:2000";

export function backendUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export interface UploadPdfResponse {
  success: true;
  documentId: string;
  chunkCount: number;
  pageCount: number;
}

export interface BackendDocument {
  _id: string;
  title: string;
  originalFileName: string;
  fileType: string;
  pageCount: number;
  chunkCount: number;
  processingStatus: string;
  summary?: string;
  topics?: unknown[];
  courseTitle?: string;
  courseDescription?: string;
  createdAt: string;
}

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in before uploading a PDF.");
  return user.getIdToken();
}

export async function uploadPdfToBackend(
  file: File,
  token: string,
  documentId: string
): Promise<UploadPdfResponse> {
  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("documentId", documentId);

  const response = await fetch(backendUrl("/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed");
  return data;
}

export async function uploadPDF(
  file: File,
  documentId = crypto.randomUUID()
): Promise<UploadPdfResponse> {
  const token = await getAuthToken();
  return uploadPdfToBackend(file, token, documentId);
}

// ── NEW: fetch all documents for the current user ─────────────────────────────
export async function fetchUserDocuments(token: string): Promise<BackendDocument[]> {
  const res = await fetch(backendUrl("/api/documents"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch documents: ${res.status}`);
  }
  const data = await res.json();
  return data.documents as BackendDocument[];
}

// ── NEW: delete a document and all its chunks ─────────────────────────────────
export async function deleteDocumentFromBackend(
  documentId: string,
  token: string
): Promise<void> {
  const res = await fetch(
    backendUrl(`/api/documents/${encodeURIComponent(documentId)}`),
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to delete document: ${res.status}`);
  }
}