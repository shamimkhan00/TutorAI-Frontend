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

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in before uploading a PDF.");
  }

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
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }

  return data;
}

export async function uploadPDF(
  file: File,
  documentId = crypto.randomUUID()
): Promise<UploadPdfResponse> {
  const token = await getAuthToken();
  return uploadPdfToBackend(file, token, documentId);
}
