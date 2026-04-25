import { create } from "zustand";

// 上传记录本地存储 Key
const UPLOAD_RECORDS_KEY = "evoscientist-recent-uploads";

export interface OperationItem {
  id: string;
  type: "tool" | "subagent" | "file";
  name: string;
  status: "running" | "success" | "error" | "idle";
  detail?: string;
  args?: Record<string, unknown>;
  result?: string;
}

export interface AttachedFile {
  filename: string;
  virtual_path: string;
  size: number;
  uploadStatus?: "uploading" | "success" | "error";
  uploadProgress?: number;
  errorMessage?: string;
}

/** 从消息内容中解析 [File: xxx] 模式的文件引用（兼容旧消息） */
export function parseFileReferences(content: string): AttachedFile[] {
  if (!content) return [];
  const regex = /\[File:\s*([^\]]+)\]/g;
  const files: AttachedFile[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1].trim();
    if (seen.has(path)) continue;
    seen.add(path);
    const filename = path.split("/").pop() || path;
    files.push({ filename, virtual_path: path, size: 0 });
  }
  return files;
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp: string;
  thinking?: string;
  thinkingDurationMs?: number;
  tool_calls?: any[];
  operations?: OperationItem[];
  attachedFiles?: AttachedFile[];
  /** True if this is an error message (e.g. rate-limit, balance) */
  isError?: boolean;
  /** Original user message for retry functionality */
  retryMessage?: string;
  // Token usage for this specific message (if available)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd?: number;
    model?: string;
  };
}

export interface UploadedFileRecord {
  threadId: string;
  filename: string;
  virtualPath: string;
  size: number;
  uploadedAt: string;
}

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  toolCalls: Map<string, any>;
  isLoadingHistory: boolean;
  optimisticMessage: string | null;
  threadStatuses: Record<string, string>;
  fileRefreshTrigger: number;

  // Artifacts 状态
  activeArtifact: { path: string; name: string; threadId: string } | null;
  fileCache: Record<string, { content?: string; blobUrl?: string; loading: boolean; error?: string }>;
  
  // 上传记录 (持久化)
  recentUploads: UploadedFileRecord[];

  // 当前对话 token 用量 (本轮流式累积)
  currentTurnUsage: TokenUsageStats;
  // 当前模型信息 (用于显示)
  currentModel?: string;
  // 当前成本估算
  currentCostUsd?: number;

  // 外部可调用的 cancelStream 函数（由 useEvoStream 设置）
  cancelStreamFn: (() => void) | null;
  setCancelStreamFn: (fn: (() => void) | null) => void;

  setThreadStatus: (threadId: string, status: string) => void;
  triggerFileRefresh: () => void;
  setActiveArtifact: (file: { path: string; name: string; threadId: string } | null) => void;
  setFileCache: (path: string, data: { content?: string; blobUrl?: string; loading?: boolean; error?: string }) => void;
  clearArtifacts: () => void;
  
  addRecentUpload: (file: UploadedFileRecord) => void;
  clearRecentUploads: () => void;
  accumulateUsage: (input: number, output: number) => void;
  setTurnUsage: (input: number, output: number, costUsd?: number, model?: string) => void;
  resetTurnUsage: () => void;
  // 将累积的 token 用量保存到最后一条消息
  saveTurnUsageToLastMessage: () => void;

  addMessage: (msg: Omit<ChatMessage, "timestamp"> & { timestamp?: string }) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  appendThinking: (content: string) => void;
  appendContent: (content: string) => void;
  setStreaming: (val: boolean) => void;
  setHistoryLoading: (val: boolean) => void;
  setOptimisticMessage: (msg: string | null) => void;
  addToolCall: (call: any) => void;
  updateToolCall: (id: string, updates: any) => void;
  addOperation: (op: Omit<OperationItem, "id"> & { id: string }) => void;
  updateOperation: (id: string, updates: Partial<OperationItem>) => void;
  finalizeRunningOperations: () => void;
  reset: () => void;
}

// 辅助函数：读取本地记录（并清理重复项）
const loadRecentUploads = (): UploadedFileRecord[] => {
  try {
    const data = localStorage.getItem(UPLOAD_RECORDS_KEY);
    if (!data) return [];
    const uploads: UploadedFileRecord[] = JSON.parse(data);
    // 去重：保留最新的记录，同一对话中的同名文件只保留一个
    const seen = new Set<string>();
    const unique: UploadedFileRecord[] = [];
    for (const upload of uploads) {
      const key = `${upload.threadId}:${upload.filename}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(upload);
      }
    }
    return unique.slice(0, 50);
  } catch {
    return [];
  }
};

// 辅助函数：保存本地记录
const saveRecentUploads = (records: UploadedFileRecord[]) => {
  try {
    localStorage.setItem(UPLOAD_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage errors
  }
};

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  toolCalls: new Map(),
  isLoadingHistory: false,
  optimisticMessage: null,
  threadStatuses: {},
  fileRefreshTrigger: 0,
  activeArtifact: null,
  fileCache: {},
  recentUploads: loadRecentUploads(), // 初始化时从 localStorage 加载
  currentTurnUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  currentModel: undefined,
  currentCostUsd: undefined,
  cancelStreamFn: null,

  setCancelStreamFn: (fn) => set({ cancelStreamFn: fn }),

  setThreadStatus: (threadId, status) => set((state) => {
    if (status === "idle" || status === "") {
      const { [threadId]: _, ...rest } = state.threadStatuses;
      return { threadStatuses: rest };
    }
    return { threadStatuses: { ...state.threadStatuses, [threadId]: status } };
  }),

  triggerFileRefresh: () => set((state) => ({
    fileRefreshTrigger: state.fileRefreshTrigger + 1,
  })),

  setActiveArtifact: (file) => set({ activeArtifact: file }),

  setFileCache: (path, data) => set((state) => ({
    fileCache: {
      ...state.fileCache,
      [path]: {
        ...state.fileCache[path],
        ...data,
      },
    },
  })),

  clearArtifacts: () => set({ activeArtifact: null, fileCache: {} }),

  addRecentUpload: (file) => set((state) => {
    const currentUploads = state.recentUploads || [];
    // 避免重复添加：检查同一对话中的同名文件（或相同路径）
    const exists = currentUploads.some(u => 
      u.virtualPath === file.virtualPath || 
      (u.threadId === file.threadId && u.filename === file.filename)
    );
    if (exists) {
      // 如果文件已存在但路径不同（重新上传），更新原有记录
      const filtered = currentUploads.filter(u => 
        !(u.threadId === file.threadId && u.filename === file.filename)
      );
      const newUploads = [file, ...filtered].slice(0, 50);
      saveRecentUploads(newUploads);
      return { recentUploads: newUploads };
    }

    const newUploads = [file, ...currentUploads].slice(0, 50); // 最多保留 50 条
    saveRecentUploads(newUploads); // 同步写入本地存储
    return { recentUploads: newUploads };
  }),

  clearRecentUploads: () => {
    localStorage.removeItem(UPLOAD_RECORDS_KEY);
    set({ recentUploads: [] });
  },

  accumulateUsage: (input, output) => set((s) => ({
    currentTurnUsage: {
      inputTokens: s.currentTurnUsage.inputTokens + input,
      outputTokens: s.currentTurnUsage.outputTokens + output,
      totalTokens: s.currentTurnUsage.totalTokens + input + output,
    },
  })),

  setTurnUsage: (input, output, costUsd, model) => set({
    currentTurnUsage: {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
    },
    currentModel: model,
    currentCostUsd: costUsd,
  }),

  saveTurnUsageToLastMessage: () => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant" && s.currentTurnUsage.totalTokens > 0) {
      msgs[msgs.length - 1] = {
        ...last,
        tokenUsage: {
          inputTokens: s.currentTurnUsage.inputTokens,
          outputTokens: s.currentTurnUsage.outputTokens,
          totalTokens: s.currentTurnUsage.totalTokens,
          costUsd: s.currentCostUsd,
          model: s.currentModel,
        },
      };
    }
    return { messages: msgs };
  }),

  resetTurnUsage: () => set({
    currentTurnUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    currentModel: undefined,
    currentCostUsd: undefined,
  }),

  setOptimisticMessage: (msg) => set({ optimisticMessage: msg }),

  addMessage: (msg) => set((s) => ({
    messages: [...s.messages, { ...msg, timestamp: msg.timestamp || new Date().toISOString() }],
  })),

  setMessages: (msgs) => set({ messages: msgs }),

  appendThinking: (content) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant") {
      msgs[msgs.length - 1] = {
        ...last,
        thinking: (last.thinking || "") + content,
      };
    } else {
      msgs.push({
        role: "assistant",
        content: "",
        thinking: content,
        timestamp: new Date().toISOString(),
      });
    }
    return { messages: msgs };
  }),

  appendContent: (content) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant") {
      msgs[msgs.length - 1] = {
        ...last,
        content: (last.content || "") + content,
      };
    } else {
      msgs.push({
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      });
    }
    return { messages: msgs };
  }),

  setStreaming: (val) => set({ isStreaming: val }),
  setHistoryLoading: (val) => set({ isLoadingHistory: val }),

  addToolCall: (call) => set((s) => {
    const m = new Map(s.toolCalls);
    m.set(call.tool_call_id, call);
    return { toolCalls: m };
  }),

  updateToolCall: (id, updates) => set((s) => {
    const m = new Map(s.toolCalls);
    const existing = m.get(id);
    if (existing) m.set(id, { ...existing, ...updates });
    return { toolCalls: m };
  }),

  addOperation: (op) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    const ops = last?.operations ? [...last.operations] : [];
    // Don't add duplicate operations with the same ID
    if (ops.find((o) => o.id === op.id)) {
      return {};
    }
    ops.push(op);
    if (last && last.role === "assistant") {
      msgs[msgs.length - 1] = { ...last, operations: ops };
    } else {
      msgs.push({
        role: "assistant",
        content: "",
        operations: ops,
        timestamp: new Date().toISOString(),
      });
    }
    return { messages: msgs };
  }),

  updateOperation: (id, updates) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.operations) {
      const idx = last.operations.findIndex((o) => o.id === id);
      if (idx >= 0) {
        const newOps = [...last.operations];
        newOps[idx] = { ...newOps[idx], ...updates };
        msgs[msgs.length - 1] = { ...last, operations: newOps };
      }
    }
    return { messages: msgs };
  }),

  finalizeRunningOperations: () => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.operations) {
      const hasRunning = last.operations.some((o) => o.status === "running");
      if (hasRunning) {
        const newOps = last.operations.map((o) =>
          o.status === "running" ? { ...o, status: "success" as const } : o
        );
        msgs[msgs.length - 1] = { ...last, operations: newOps };
      }
    }
    return { messages: msgs };
  }),

  reset: () => set((s) => ({
    messages: [],
    isStreaming: false,
    toolCalls: new Map(),
    optimisticMessage: null,
    activeArtifact: null,
    fileCache: {},
    currentTurnUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    currentModel: undefined,
    currentCostUsd: undefined,
    cancelStreamFn: null,
    // 注意：不清空 recentUploads，因为这是历史记录
  })),
}));
