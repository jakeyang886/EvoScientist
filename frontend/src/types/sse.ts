// ─── SSE Event Types (17 types, matching SPEC §30) ────────────

interface BaseSSEEvent {
  id: string;
  timestamp: string;
  thread_id: string;
}

export interface ThinkingEvent extends BaseSSEEvent {
  type: "thinking";
  content: string;
}

export interface ReasoningEvent extends BaseSSEEvent {
  type: "reasoning";
  content: string;
}

export interface TextEvent extends BaseSSEEvent {
  type: "text";
  content: string;
  is_final?: boolean;
}

export interface ToolCallEvent extends BaseSSEEvent {
  type: "tool_call";
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  // Backend sends these (emitter.py):
  name?: string;
  args?: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseSSEEvent {
  type: "tool_result";
  tool_call_id?: string;
  tool_name?: string;
  output?: string;
  success: boolean;
  // Backend sends these (emitter.py):
  name?: string;
  content?: string;
}

export interface SubagentStartEvent extends BaseSSEEvent {
  type: "subagent_start";
  subagent_id?: string;
  subagent_name?: string;
  task?: string;
  // Backend sends these (emitter.py):
  name?: string;
  description?: string;
}

export interface SubagentEndEvent extends BaseSSEEvent {
  type: "subagent_end";
  subagent_id?: string;
  subagent_name?: string;
  status?: "success" | "error" | "cancelled";
  result?: string;
  // Backend sends these (emitter.py):
  name?: string;
}

export interface SubagentTextEvent extends BaseSSEEvent {
  type: "subagent_text";
  subagent_id?: string;
  subagent_name?: string;
  content: string;
  // Backend sends these (emitter.py):
  subagent?: string;
  instance_id?: string;
}

export interface SubagentToolCallEvent extends BaseSSEEvent {
  type: "subagent_tool_call";
  subagent_id?: string;
  subagent_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_call_id?: string;
  // Backend sends these (emitter.py):
  subagent?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface SubagentToolResultEvent extends BaseSSEEvent {
  type: "subagent_tool_result";
  subagent_id?: string;
  subagent_name?: string;
  tool_name?: string;
  tool_call_id?: string;
  output?: string;
  success: boolean;
  // Backend sends these (emitter.py):
  subagent?: string;
  name?: string;
  content?: string;
}

export interface InterruptEvent extends BaseSSEEvent {
  type: "interrupt";
  interrupt_id: string;
  tool_name?: string;
  args?: Record<string, unknown>;
  timeout?: number;
  // Backend sends these (emitter.py):
  action_requests?: any[];
  review_configs?: any[];
}

export interface AskUserEvent extends BaseSSEEvent {
  type: "ask_user";
  interrupt_id: string;
  question?: string;
  timeout?: number;
  // Backend sends these (emitter.py):
  questions?: any[];
  tool_call_id?: string;
}

export interface ToolSelectionEvent extends BaseSSEEvent {
  type: "tool_selection";
  tools: string[];
}

export interface SummarizationStartEvent extends BaseSSEEvent {
  type: "summarization_start";
}

export interface SummarizationEvent extends BaseSSEEvent {
  type: "summarization";
  content: string;
  cutoff_index?: number;
  file_path?: string;
}

export interface TitleUpdatedEvent extends BaseSSEEvent {
  type: "title_updated";
  title: string;
}

export interface UsageStatsEvent extends BaseSSEEvent {
  type: "usage_stats";
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model: string;
  cost_usd?: number;
}

export interface ErrorEvent extends BaseSSEEvent {
  type: "error";
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface FileUploadEvent extends BaseSSEEvent {
  type: "file_upload";
  files: Array<{
    filename: string;
    virtual_path: string;
    size: number;
  }>;
}

export interface DoneEvent extends BaseSSEEvent {
  type: "done";
  final_answer?: string;
  input_tokens?: number;
  output_tokens?: number;
  // Backend sends these (emitter.py):
  content?: string;
  response?: string;
}

export interface BalanceUpdateEvent {
  type: "balance_update";
  plan: string;
  token_balance?: number;
  plan_expires_at?: string | null;
  billed_tokens: number;
  rate_limit: {
    minute_used: number;
    minute_limit: number;
    day_used: number;
    day_limit: number;
  };
}

export type SSEEvent =
  | ThinkingEvent
  | ReasoningEvent
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | SubagentTextEvent
  | SubagentToolCallEvent
  | SubagentToolResultEvent
  | InterruptEvent
  | AskUserEvent
  | ToolSelectionEvent
  | SummarizationStartEvent
  | SummarizationEvent
  | TitleUpdatedEvent
  | UsageStatsEvent
  | ErrorEvent
  | FileUploadEvent
  | BalanceUpdateEvent
  | DoneEvent;
