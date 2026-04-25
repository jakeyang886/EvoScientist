// ─── Types ────────────────────────────────────────────────────

export interface User {
  uid: string;
  username: string;
  email: string;
  avatar_url?: string;
  plan: "starter" | "pro" | "max" | "ultra";
  email_verified: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export interface Thread {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source: "cli" | "web";
  status: "active" | "completed" | "error" | "cancelled";
  metadata?: {
    user_id?: string;
    workspace_dir?: string;
    model?: string;
  };
}

export interface ThreadListResponse {
  threads: Thread[];
  total: number;
  has_more: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  thread_id: string;
  tool_calls?: ToolCall[];
  attachments?: FileAttachment[];
}

export interface ToolCall {
  tool_call_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  status: "pending" | "running" | "success" | "error";
  output?: string;
  error?: string;
}

export interface FileAttachment {
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
}

export interface FileInfo {
  filename: string;
  size: number;
  mime_type: string;
  virtual_path: string;
}

export interface UploadResponse {
  files: FileInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  max_tokens: number;
  supports_vision: boolean;
  supports_reasoning: boolean;
}

export interface ModelListResponse {
  models: ModelInfo[];
  default_model: string;
}
