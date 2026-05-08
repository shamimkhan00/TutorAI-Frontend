import type { DocType } from "../_types/dashboard";

export function createId() {
  return Math.random().toString(36).slice(2, 9);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function getDocType(file: File): DocType {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "text";
}

export function getDocIcon(type: DocType) {
  return { pdf: "PDF", image: "IMG", text: "TXT" }[type];
}
