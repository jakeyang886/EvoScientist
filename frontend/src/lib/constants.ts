// ─── Application Constants ────────────────────────────────────

export const API_BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8065";

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_UPLOAD = 10;

export const ALLOWED_FILE_EXTENSIONS = [
  ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".csv", ".md", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf",
];

export const SSE_HEARTBEAT_INTERVAL = 15000; // 15s
export const SSE_MAX_RECONNECTS = 5;

export const HITL_TIMEOUT = 300; // 5 minutes

export const SUPPORTED_LANGUAGES = [
  { code: "zh-CN", name: "简体中文" },
  { code: "en-US", name: "English" },
] as const;
