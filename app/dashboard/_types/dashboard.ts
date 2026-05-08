export type DocStatus = "uploading" | "processing" | "ready" | "error";
export type DocType = "pdf" | "image" | "text";
export type RightTab = "summary" | "keypoints" | "qa";
export type MsgRole = "user" | "assistant";

export interface Doc {
  id: string;
  name: string;
  type: DocType;
  size: number;
  status: DocStatus;
  progress: number;
  summary?: string;
  keyPoints?: string[];
  qaList?: { q: string; a: string }[];
  extractedText?: string;
}

export interface Msg {
  id: string;
  role: MsgRole;
  content: string;
  streaming?: boolean;
  citations?: { docName: string; page?: number; excerpt: string }[];
}
