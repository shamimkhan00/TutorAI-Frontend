// lib/api.ts
import { auth } from "@/lib/firebase"; // your existing export

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL; // e.g. http://localhost:5000

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function uploadPDF(file: File, documentId?: string) {
  const headers = await getAuthHeaders();

  const formData = new FormData();
  formData.append("pdf", file);
  if (documentId) formData.append("documentId", documentId);

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers, // Authorization header only — don't set Content-Type with FormData
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Upload failed");
  }

  return res.json(); // { success, documentId, chunkCount }
}