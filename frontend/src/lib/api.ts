// ─── API Client with auto token refresh ───────────────────────
import { ChatMessage } from "@/store/chat-store";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getAuthTokens(): { access_token: string; refresh_token: string } | null {
  try {
    const stored = localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

async function refreshToken(): Promise<boolean> {
  const stored = localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens");
  if (!stored) return false;
  try {
    const tokens = JSON.parse(stored);
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8065";
    const res = await fetch(`${gatewayUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const newTokens = { access_token: data.access_token, refresh_token: data.refresh_token };
    localStorage.setItem("auth_tokens", JSON.stringify(newTokens));
    sessionStorage.setItem("auth_tokens", JSON.stringify(newTokens));
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, params, signal } = options;

  // Build URL — use direct gateway URL when configured (bypasses Next.js rewrite buffering)
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;
  let url = gatewayUrl ? `${gatewayUrl}${path}` : path;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  // Build headers
  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  // Only set Content-Type to JSON if body is not FormData
  const isFormData = body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  // Attach token
  const tokens = getAuthTokens();
  if (tokens?.access_token) {
    requestHeaders.Authorization = `Bearer ${tokens.access_token}`;
  }

  let response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    signal,
  });

  // 401 → auto refresh → retry once (skip for auth endpoints that return 401 for credential errors)
  const isAuthEndpoint = path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/register") ||
    path.startsWith("/api/auth/forgot-password") ||
    path.startsWith("/api/auth/reset-password") ||
    path.startsWith("/api/auth/verify-email");

  if (response.status === 401) {
    if (isAuthEndpoint) {
      return await handleApiResponse<T>(response);
    }
    const refreshed = await refreshToken();
    if (refreshed) {
      const newTokens = getAuthTokens();
      if (newTokens?.access_token) {
        requestHeaders.Authorization = `Bearer ${newTokens.access_token}`;
        response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
          signal,
        });
        if (response.status === 401) {
          redirectToLogin();
          throw new ApiError("auth_token_expired", 401, "auth_token_expired");
        }
        return await handleApiResponse<T>(response);
      }
    }
    redirectToLogin();
    throw new ApiError("auth_token_expired", 401, "auth_token_expired");
  }

  return handleApiResponse<T>(response);
}

async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code: string | undefined;
    try {
      const errorBody = await response.json();
      code = errorBody?.code;
    } catch {
      // ignore parse errors on error responses
    }
    throw new ApiError(response.statusText, response.status, code);
  }
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json() as T;
  }
  return response.text() as unknown as T;
}

// ─── Types ────────────────────────────────────────────────────

export interface Thread {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source?: string;
  user_uid?: string;
  metadata?: Record<string, unknown>;
  status?: "running" | "idle";
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  max_tokens: number;
  supports_vision: boolean;
  supports_reasoning: boolean;
}

// ─── API namespaces ───────────────────────────────────────────

const BASE = "/api";

export const threadsApi = {
  list: () => apiFetch<{ threads: Thread[]; total: number }>(`${BASE}/threads`),
  create: (body?: { message?: string; model?: string }) =>
    apiFetch<{ thread_id: string; title: string }>(`${BASE}/threads`, { method: "POST", body }),
  delete: (id: string) => apiFetch<{}>(`${BASE}/threads/${id}`, { method: "DELETE" }),
  rename: (id: string, title: string) =>
    apiFetch<Thread>(`${BASE}/threads/${id}`, { method: "PATCH", body: { title } }),
  getMessages: (id: string) =>
    apiFetch<{ messages: ChatMessage[]; total: number }>(`${BASE}/threads/${id}/messages`),
  getStatuses: () => apiFetch<{ statuses: Record<string, string> }>(`${BASE}/threads/status`),
  // Get token usage for a specific thread
  getTokenUsage: (threadId: string) =>
    apiFetch<TokenUsageResponse>(`${BASE}/users/me/token-usage`, { params: { thread_id: threadId } }),
};

export const modelsApi = {
  list: () =>
    apiFetch<{ models: ModelInfo[]; default_model: string }>(`${BASE}/models`),
};

// ─── Users API ────────────────────────────────────────────────

export interface TokenUsageDay {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
}

export interface TokenUsageSummary {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
}

export interface TokenUsageMonth {
  month: string;  // "YYYY-MM"
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
}

export interface TokenUsageResponse {
  daily: TokenUsageDay[];
  monthly: TokenUsageMonth[];
  total: TokenUsageSummary;
  today: TokenUsageSummary;
  thread?: TokenUsageSummary;
}

export interface TokenUsageThread {
  thread_id: string;
  title: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
  model: string | null;
  last_used: string;
}

export interface TokenUsageThreadsResponse {
  threads: TokenUsageThread[];
}

export interface TokenUsageRecord {
  id: number;
  thread_id: string;
  title: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}

export interface TokenUsageRecordsResponse {
  records: TokenUsageRecord[];
  total: number;
}

export interface TokenUsageHour {
  hour: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
}

export interface TokenUsageHourlyResponse {
  date: string;
  hourly: TokenUsageHour[];
  summary: TokenUsageSummary;
}

export interface TokenUsage7dDay {
  date: string;
  hourly: TokenUsageHour[];
}

export interface TokenUsage7dHourlyResponse {
  days: TokenUsage7dDay[];
  summary_7d: TokenUsageSummary;
}

export const usersApi = {
  tokenUsage: (days: number = 30, threadId?: string) =>
    apiFetch<TokenUsageResponse>(`${BASE}/users/me/token-usage`, {
      params: {
        ...(days !== 30 ? { days: String(days) } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
      },
    }),
  tokenUsageThreads: (limit: number = 50) =>
    apiFetch<TokenUsageThreadsResponse>(`${BASE}/users/me/token-usage/threads`, {
      params: { ...(limit !== 50 ? { limit: String(limit) } : {}) },
    }),
  tokenUsageRecords: (limit: number = 50, offset: number = 0, threadId?: string) =>
    apiFetch<TokenUsageRecordsResponse>(`${BASE}/users/me/token-usage/records`, {
      params: {
        ...(limit !== 50 ? { limit: String(limit) } : {}),
        ...(offset > 0 ? { offset: String(offset) } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
      },
    }),
  tokenUsageHourly: (date?: string, threadId?: string) =>
    apiFetch<TokenUsageHourlyResponse>(`${BASE}/users/me/token-usage/hourly`, {
      params: {
        ...(date ? { date } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
      },
    }),
  tokenUsage7dHourly: (threadId?: string) =>
    apiFetch<TokenUsage7dHourlyResponse>(`${BASE}/users/me/token-usage/7d-hourly`, {
      params: {
        ...(threadId ? { thread_id: threadId } : {}),
      },
    }),
};

// ─── Uploads API ──────────────────────────────────────────────

export interface UploadedFile {
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  created_at: number;
}

export const uploadsApi = {
  upload: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    // Pass empty headers to prevent apiFetch from setting Content-Type: application/json
    // Browser will auto-set the correct multipart/form-data boundary
    return apiFetch<{ files: { filename: string; size: number; mime_type: string; virtual_path: string }[] }>(
      `${BASE}/uploads`,
      { method: "POST", body: formData, headers: {} },
    );
  },
  list: () => apiFetch<{ files: UploadedFile[] }>(`${BASE}/uploads`),
  delete: (path: string) => apiFetch<{ success: boolean }>(`${BASE}/uploads/${encodeURIComponent(path)}`, { method: "DELETE" }),
};

// ─── Balance API ──────────────────────────────────────────────

export interface UserBalance {
  plan: "starter" | "pro" | "max" | "ultra";
  role: "user" | "admin";
  token_balance: number | null;
  total_consumed: number | null;
  plan_expires_at: string | null;
  is_active: boolean;
  concurrent_limit: number;
}

export interface RechargeRecord {
  id: number;
  type: "tokens" | "days";
  amount: number;
  balance_before: string | null;
  balance_after: string | null;
  remark: string | null;
  operator_name: string | null;
  created_at: string;
}

export interface RateLimitStatus {
  minute_used: number;
  minute_limit: number;
  day_used: number;
  day_limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const balanceApi = {
  get: () => apiFetch<UserBalance>(`${BASE}/users/me/balance`),
  rechargeRecords: (page = 1, size = 20) =>
    apiFetch<PaginatedResponse<RechargeRecord>>(`${BASE}/users/me/recharge-records`, {
      params: { page: String(page), size: String(size) },
    }),
  rateLimitStatus: () => apiFetch<RateLimitStatus>(`${BASE}/users/me/rate-limit-status`),
};

// ─── Admin Auth ────────────────────────────────────────────────

function getAdminTokens(): { access_token: string; refresh_token: string } | null {
  try {
    const stored = localStorage.getItem("admin_tokens");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Fetch wrapper for admin API — uses admin token from localStorage */
async function adminApiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, params, signal } = options;

  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;
  let url = gatewayUrl ? `${gatewayUrl}${path}` : path;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const requestHeaders: Record<string, string> = { ...headers };
  const isFormData = body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const adminTokens = getAdminTokens();
  if (adminTokens?.access_token) {
    requestHeaders.Authorization = `Bearer ${adminTokens.access_token}`;
  }

  let response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    signal,
  });

  // Auto-refresh admin token on 401
  if (response.status === 401) {
    if (adminTokens?.refresh_token) {
      try {
        const gwUrl = gatewayUrl || "http://localhost:8065";
        const refreshRes = await fetch(`${gwUrl}/api/admin/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: adminTokens.refresh_token }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const newTokens = { access_token: data.access_token, refresh_token: data.refresh_token };
          localStorage.setItem("admin_tokens", JSON.stringify(newTokens));
          requestHeaders.Authorization = `Bearer ${newTokens.access_token}`;
          response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
            signal,
          });
        }
      } catch {
        // Refresh failed
      }
    }
    if (response.status === 401) {
      localStorage.removeItem("admin_tokens");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin-login")) {
        window.location.href = "/admin-login";
      }
      throw new ApiError("admin_token_expired", 401, "admin_token_expired");
    }
  }

  return handleApiResponse<T>(response);
}

export const adminAuth = {
  login: async (email: string, password: string) => {
    const data = await apiFetch<{ access_token: string; refresh_token: string; user: { uid: string; username: string; email: string } }>(
      `${BASE}/admin/auth/login`,
      { method: "POST", body: { email, password } },
    );
    localStorage.setItem("admin_tokens", JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    }));
    return data;
  },
  logout: async () => {
    const tokens = getAdminTokens();
    if (tokens?.refresh_token) {
      try {
        await apiFetch(`${BASE}/admin/auth/logout`, {
          method: "POST",
          body: { refresh_token: tokens.refresh_token },
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem("admin_tokens");
  },
  isAuthenticated: () => !!localStorage.getItem("admin_tokens"),
};

// ─── Admin API ────────────────────────────────────────────────

export interface AdminUser {
  uid: string;
  username: string;
  email: string;
  plan: string;
  status: string;
  role: string;
  token_balance: number | null;
  total_consumed: number | null;
  plan_expires_at: string | null;
  email_verified: boolean;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  login_count: number | null;
  last_login: string | null;
  active_threads: number;
}

export interface AdminRechargeRecord {
  id: number;
  username: string;
  type: "tokens" | "days";
  amount: number;
  balance_before: string | null;
  balance_after: string | null;
  remark: string | null;
  operator_name: string | null;
  created_at: string;
}

export interface AdminRechargeSummary {
  total_count: number;
  total_tokens: number;
  total_days: number;
  today_count: number;
  today_tokens: number;
  today_days: number;
}

export interface AdminConsumptionUser {
  uid: string;
  username: string;
  plan: string;
  total_tokens: number;
  total_messages: number;
  last_active: string | null;
}

export interface AdminConsumptionSummary {
  total_tokens: number;
  active_users: number;
  avg_tokens_per_user: number;
}

export interface AdminTokenStatsDay {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
  active_users: number;
}

export interface AdminTokenStatsSummary {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
  active_users: number;
}

export interface AdminTokenStatsHourly {
  hour: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
  active_users: number;
}

export interface AdminTokenStatsResponse {
  daily: AdminTokenStatsDay[];
  hourly?: AdminTokenStatsHourly[];  // only populated when days=1
  summary: {
    "1d": AdminTokenStatsSummary;
    "7d": AdminTokenStatsSummary;
    "30d": AdminTokenStatsSummary;
  };
}

export interface AdminLlmEndpointConfig {
  name: string;
  api_key: string;
  base_url: string;
  weight: number;
  extra_body: Record<string, unknown>;
  default_headers: Record<string, string>;
}

export interface AdminLlmModelEntry {
  id: string;
  alias: string;
  max_tokens: number;
  supports_vision: boolean;
  supports_reasoning: boolean;
  endpoint: string;
  params: Record<string, unknown>;
}

export interface AdminLlmProviderConfig {
  api_key: string;
  base_url: string;
  protocol: "openai" | "anthropic" | "google-genai" | "ollama";
  extra_body: Record<string, unknown>;
  default_headers: Record<string, string>;
  models: AdminLlmModelEntry[];
  endpoints: AdminLlmEndpointConfig[];
}

export interface AdminLlmSettings {
  default_model: string;
  model_defaults: {
    temperature: number | null;
    max_tokens: number;
    reasoning_effort: string;
    stream_usage: boolean;
  };
  providers: Record<string, AdminLlmProviderConfig>;
}

export const adminApi = {
  users: (params?: { q?: string; plan?: string; status?: string; page?: number; size?: number }) =>
    adminApiFetch<PaginatedResponse<AdminUser>>(`${BASE}/admin/users`, { params: params as Record<string, string> }),
  userDetail: (uid: string) => adminApiFetch<AdminUserDetail>(`${BASE}/admin/users/${uid}`),
  changePlan: (uid: string, plan: string, days?: number) =>
    adminApiFetch<{ plan: string }>(`${BASE}/admin/users/${uid}/plan`, { method: "PUT", body: { plan, days } }),
  changeStatus: (uid: string, status: string) =>
    adminApiFetch<{ status: string }>(`${BASE}/admin/users/${uid}/status`, { method: "PUT", body: { status } }),
  recharge: (uid: string, type: "tokens" | "days", amount: number, remark?: string) =>
    adminApiFetch<{ balance_before: unknown; balance_after: unknown }>(`${BASE}/admin/users/${uid}/recharge`, {
      method: "POST",
      body: { type, amount, remark },
    }),
  forceLogout: (uid: string) =>
    adminApiFetch<{ removed_threads: string[] }>(`${BASE}/admin/users/${uid}/force-logout`, { method: "POST", body: {} }),
  runningThreads: () => adminApiFetch<{ threads: Record<string, { user_uid: string; started_at: string }> }>(`${BASE}/admin/threads/running`),
  stats: () => adminApiFetch<{
    total_users: number;
    active_users_today: number;
    total_tokens_consumed_today: number;
    active_threads: number;
    users_by_plan: Record<string, number>;
  }>(`${BASE}/admin/stats`),
  recharges: (params?: { q?: string; type?: string; date_from?: string; date_to?: string; page?: number; size?: number }) =>
    adminApiFetch<PaginatedResponse<AdminRechargeRecord>>(`${BASE}/admin/recharges`, { params: params as Record<string, string> }),
  rechargeSummary: (params?: { date_from?: string; date_to?: string }) =>
    adminApiFetch<AdminRechargeSummary>(`${BASE}/admin/recharges/summary`, { params: params as Record<string, string> }),
  consumption: (params?: { date_from?: string; date_to?: string; page?: number; size?: number }) =>
    adminApiFetch<PaginatedResponse<AdminConsumptionUser>>(`${BASE}/admin/consumption`, { params: params as Record<string, string> }),
  consumptionSummary: (params?: { date_from?: string; date_to?: string }) =>
    adminApiFetch<AdminConsumptionSummary>(`${BASE}/admin/consumption/summary`, { params: params as Record<string, string> }),
  tokenStats: (days: number = 30) =>
    adminApiFetch<AdminTokenStatsResponse>(`${BASE}/admin/token-stats`, { params: { days: String(days) } }),
  pricing: () =>
    adminApiFetch<Record<string, any>>(`${BASE}/admin/settings/pricing`),
  updatePricing: (data: Record<string, any>) =>
    adminApiFetch<{ ok: boolean; version: number }>(`${BASE}/admin/settings/pricing`, {
      method: "PUT",
      body: data,
    }),
  // Timezone settings
  getTimezone: () =>
    adminApiFetch<{ timezone: string }>(`${BASE}/admin/settings/timezone`),
  updateTimezone: (timezone: string) =>
    adminApiFetch<{ ok: boolean; timezone: string }>(`${BASE}/admin/settings/timezone`, {
      method: "PUT",
      body: { timezone },
    }),
  getLlmSettings: () =>
    adminApiFetch<AdminLlmSettings>(`${BASE}/admin/settings/llm`),
  updateLlmSettings: (data: AdminLlmSettings) =>
    adminApiFetch<{ ok: boolean; default_model: string }>(`${BASE}/admin/settings/llm`, {
      method: "PUT",
      body: data,
    }),
  endpointStats: () =>
    adminApiFetch<{
      endpoints: Array<{
        provider: string;
        endpoint: string;
        calls: number;
        pct: number;
        bar: string;
        input_tokens: number;
        output_tokens: number;
        models: Record<string, number>;
        last_call_ts: number;
      }>;
      summary: {
        total_calls: number;
        total_input_tokens: number;
        total_output_tokens: number;
      };
    }>(`${BASE}/admin/endpoints/stats`),
  resetEndpointStats: () =>
    adminApiFetch<{ ok: boolean }>(`${BASE}/admin/endpoints/stats/reset`, { method: "POST", body: {} }),
  endpointHistory: (params: {
    start_date?: string;
    end_date?: string;
    group_by?: "day" | "endpoint" | "model";
  }) =>
    adminApiFetch<{
      group_by: string;
      start_date: string;
      end_date: string;
      dates?: string[];
      endpoints?: Array<{
        provider: string;
        endpoint: string;
        calls: number;
        pct?: number;
        bar?: string;
        input_tokens: number;
        output_tokens: number;
        models?: string[] | Record<string, number>;
        total_input?: number;
        total_output?: number;
        total_calls?: number;
        days?: Array<{
          date: string;
          input_tokens: number;
          output_tokens: number;
          calls: number;
        }>;
      }>;
      models?: Array<{
        model: string;
        endpoint: string;
        provider: string;
        calls: number;
        pct: number;
        input_tokens: number;
        output_tokens: number;
      }>;
      summary?: {
        total_calls: number;
        total_input_tokens: number;
        total_output_tokens: number;
      };
    }>(`${BASE}/admin/endpoints/history?${new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, v!])
    ).toString()}`),
};
