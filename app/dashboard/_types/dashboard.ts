// app/dashboard/_types/dashboard.ts

export type DocStatus = "uploading" | "processing" | "ready" | "error";
export type DocType   = "pdf" | "image" | "text";
export type RightTab  = "summary" | "keypoints" | "qa" | "topics"; // ← "topics" added
export type MsgRole   = "user" | "assistant";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Topic {
  id: string;
  order: number;
  title: string;
  summary: string;
  subtopics: string[];
  difficulty: Difficulty;
  estimatedMinutes: number;
}

export interface CourseOutline {
  courseTitle: string;
  description: string;
  topics: Topic[];
  fromCache?: boolean;
}

/** Tracks an active tutor session — which topic is being taught */
export interface TutorSession {
  documentId: string;
  activeTopic: Topic | null;   // null = "start from beginning"
  stage: "idle" | "teaching" | "done";
}

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
  // ── NEW ──────────────────────────────────────────────────────────
  courseOutline?: CourseOutline;   // populated after topics are fetched
  topicsLoading?: boolean;         // true while fetching topics
  topicsError?: string;            // error message if fetch failed
}

export interface Msg {
  id: string;
  role: MsgRole;
  content: string;
  streaming?: boolean;
  citations?: { docName: string; page?: number; excerpt: string }[];
}