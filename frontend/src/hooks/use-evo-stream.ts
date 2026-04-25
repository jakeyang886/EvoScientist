"use client";

import { useState, useCallback, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import type { SSEEvent } from "@/types/sse";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/use-threads";

interface UseEvoStreamOptions {
  threadId: string;
  onDone?: (event: SSEEvent) => void;
  onError?: (event: SSEEvent) => void;
  /** Called when a blockable error occurs (429 rate-limit, 402 balance, 403 forbidden).
   *  Receives { code, message, status } from the backend error detail. */
  onBlocked?: (info: { code: string; message: string; status: number }) => void;
}

export function useEvoStream({ threadId, onDone, onError, onBlocked }: UseEvoStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isProcessingRef = useRef(false);
  const { addMessage, appendThinking, appendContent, setStreaming, addToolCall, updateToolCall, addOperation, updateOperation, finalizeRunningOperations, setThreadStatus, triggerFileRefresh, setMessages, accumulateUsage, resetTurnUsage, saveTurnUsageToLastMessage, setTurnUsage } = useChatStore();
  const queryClient = useQueryClient();

  // Typewriter queue state (shared between processStream and cancelStream)
  const typeQueueRef = useRef<string[]>([]);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Thinking typewriter queue (separate from main text queue)
  const thinkingQueueRef = useRef<string[]>([]);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last subagent ID for completing operations
  const lastSubagentOpId = useRef<string>("");

  const drainTypeQueue = useCallback(() => {
    const queue = typeQueueRef.current;
    if (queue.length === 0) {
      typeTimerRef.current = null;
      return;
    }
    // Emit up to 3 chars per tick (~20ms interval ≈ 150 chars/sec, natural reading speed)
    const batch = queue.splice(0, 3).join("");
    if (batch) appendContent(batch);
    typeTimerRef.current = setTimeout(drainTypeQueue, 20);
  }, [appendContent]);

  const drainThinkingQueue = useCallback(() => {
    const queue = thinkingQueueRef.current;
    if (queue.length === 0) {
      thinkingTimerRef.current = null;
      return;
    }
    const batch = queue.splice(0, 3).join("");
    if (batch) appendThinking(batch);
    thinkingTimerRef.current = setTimeout(drainThinkingQueue, 20);
  }, [appendThinking]);

  const enqueueText = useCallback((text: string) => {
    typeQueueRef.current.push(...text.split(""));
    if (!typeTimerRef.current) {
      typeTimerRef.current = setTimeout(drainTypeQueue, 0);
    }
  }, [drainTypeQueue]);

  const enqueueThinking = useCallback((text: string) => {
    thinkingQueueRef.current.push(...text.split(""));
    if (!thinkingTimerRef.current) {
      thinkingTimerRef.current = setTimeout(drainThinkingQueue, 0);
    }
  }, [drainThinkingQueue]);

  const flushTypeQueue = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    const queue = typeQueueRef.current;
    if (queue.length > 0) {
      appendContent(queue.join(""));
      queue.length = 0;
    }
    // Also flush thinking queue
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    const thinkQ = thinkingQueueRef.current;
    if (thinkQ.length > 0) {
      appendThinking(thinkQ.join(""));
      thinkQ.length = 0;
    }
  }, [appendContent, appendThinking]);

  const processStream = useCallback(async (response: Response, originalMessage?: string) => {
    // Guard against concurrent stream execution
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    if (!response.body) {
      isProcessingRef.current = false;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              const event = data as SSEEvent;

              switch (event.type) {
                case "thinking":
                case "reasoning":
                  if (event.content) enqueueThinking(event.content);
                  break;
                case "text":
                  enqueueText(event.content);
                  break;
                case "tool_call": {
                  const raw = event as any;
                  const tcId = raw.id || event.tool_call_id || `tc_${Date.now()}`;
                  addOperation({
                    id: tcId,
                    type: "tool",
                    name: event.name || event.tool_name || "unknown",
                    status: "running",
                    args: event.args || event.tool_input || {},
                  });
                  break;
                }
                case "tool_result": {
                  const raw = event as any;
                  // Backend sends tool_call_id in the event (added in emitter.py)
                  const tcId = raw.tool_call_id || raw.id || "";
                  updateOperation(tcId, {
                    status: event.success ? "success" : "error",
                    result: (event.content || event.output || "").slice(0, 500),
                  });
                  break;
                }
                case "subagent_start": {
                  const saName = event.name || event.subagent_name || "sub-agent";
                  const saId = `sa_${Date.now()}`;
                  lastSubagentOpId.current = saId;
                  addOperation({
                    id: saId,
                    type: "subagent",
                    name: saName,
                    status: "running",
                    detail: event.description || "启动中",
                  });
                  break;
                }
                case "subagent_text": {
                  enqueueText(event.content);
                  break;
                }
                case "subagent_tool_call": {
                  const saName = event.subagent || event.subagent_name || "sub-agent";
                  const raw = event as any;
                  // Backend sends "id" field (from emitter.py subagent_tool_call)
                  const tcId = raw.id || raw.tool_call_id || `sa_tc_${Date.now()}`;
                  addOperation({
                    id: tcId,
                    type: "tool",
                    name: `${saName}: ${event.name || "tool"}`,
                    status: "running",
                  });
                  break;
                }
                case "subagent_tool_result": {
                  const raw = event as any;
                  // Backend now sends tool_call_id (added in emitter.py)
                  const tcId = raw.tool_call_id || raw.id || "";
                  if (tcId) {
                    updateOperation(tcId, {
                      status: event.success ? "success" : "error",
                    });
                  }
                  break;
                }
                case "subagent_end": {
                  if (lastSubagentOpId.current) {
                    updateOperation(lastSubagentOpId.current, { status: "success" });
                    lastSubagentOpId.current = "";
                  }
                  break;
                }
                case "ask_user": {
                  // Agent is asking the user a question — show notification
                  const questions = event.questions || [];
                  toast.info("Agent 需要你回答: " + (questions[0] || ""));
                  break;
                }
                case "interrupt": {
                  // HITL approval required
                  toast.warning("需要人工审批工具调用");
                  break;
                }
                case "usage_stats": {
                  // Accumulate token usage from backend, with cost and model info
                  accumulateUsage(event.input_tokens || 0, event.output_tokens || 0);
                  // Save cost and model info to store for later use
                  if (event.cost_usd !== undefined || event.model) {
                    useChatStore.setState({
                      currentCostUsd: event.cost_usd,
                      currentModel: event.model,
                    });
                  }
                  break;
                }
                case "summarization_start": {
                  appendContent("\n📝 *正在整理对话上下文...*\n");
                  break;
                }
                case "summarization": {
                  enqueueText(event.content);
                  break;
                }
                case "title_updated": {
                  // Thread title was auto-generated — refresh sidebar to show new title
                  queryClient.invalidateQueries({ queryKey: queryKeys.threads.list() });
                  break;
                }
                case "error":
                  toast.error(event.message);
                  break;
                case "file_upload": {
                  // Backend confirms files attached to this stream turn.
                  // Scheme A already sets attachedFiles in addMessage, so this
                  // is a consistency safeguard only — no UI action needed.
                  break;
                }
                case "balance_update": {
                  // Invalidate balance query so sidebar updates
                  queryClient.invalidateQueries({ queryKey: ["balance"] });
                  break;
                }
                case "done":
                  // Safety net: finalize any operations still running
                  finalizeRunningOperations();
                  // Save token usage to the last message before finishing
                  saveTurnUsageToLastMessage();
                  setIsStreaming(false);
                  setStreaming(false);
                  setThreadStatus(threadId, "");
                  triggerFileRefresh();
                  setStreaming(false);
                  setThreadStatus(threadId, "");
                  triggerFileRefresh();
                  // Invalidate thread list so new conversations appear in sidebar
                  queryClient.invalidateQueries({ queryKey: queryKeys.threads.list() });
                  // Refresh sidebar token usage stats
                  queryClient.invalidateQueries({ queryKey: queryKeys.tokenUsage.all });
                  onDone?.(event);
                  break;
              }
            } catch (e) {
              // JSON parse failed, likely due to network chunking (truncated JSON).
              // Push the incomplete line back to buffer to be completed by the next chunk.
              buffer = line + "\n" + buffer;
              break; // Stop processing further lines in this chunk
            }
          }
        }
      }
    } catch (err) {
      if ((err as any).name !== "AbortError") {
        toast.error("Stream interrupted");
        // Show error in conversation with retry
        if (originalMessage) {
          const { messages: streamErrMsgs } = useChatStore.getState();
          setMessages([
            ...streamErrMsgs,
            {
              role: "assistant",
              content: "⚠️ 连接已中断，请重试",
              timestamp: new Date().toISOString(),
              isError: true,
              retryMessage: originalMessage,
            },
          ]);
        }
      }
      isProcessingRef.current = false;
    } finally {
      // Flush any remaining queued chars immediately
      flushTypeQueue();
      // Safety net: finalize any operations still running (e.g. stream interrupted)
      finalizeRunningOperations();
      // Save token usage to the last message if available
      saveTurnUsageToLastMessage();
      setIsStreaming(false);
      setStreaming(false);
      setThreadStatus(threadId, "");
      triggerFileRefresh();
      isProcessingRef.current = false;
    }
  }, [addMessage, appendThinking, appendContent, setStreaming, addToolCall, updateToolCall, onDone, enqueueText, enqueueThinking, flushTypeQueue, addOperation, updateOperation, finalizeRunningOperations, accumulateUsage, saveTurnUsageToLastMessage]);

  const sendMessage = useCallback(
    async (message: string, files?: any[], model?: string, effort?: string) => {
      setIsStreaming(true);
      resetTurnUsage();
      setStreaming(true);
      setThreadStatus(threadId, "running");

      // Clear any leftover queue from previous stream
      typeQueueRef.current.length = 0;
      thinkingQueueRef.current.length = 0;
      lastSubagentOpId.current = "";
      if (typeTimerRef.current) {
        clearTimeout(typeTimerRef.current);
        typeTimerRef.current = null;
      }
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }

      // Invalidate thread list
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.list() });

      // Abort any existing stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
        const accessToken = tokens.access_token;

        // Build model_params with reasoning_effort if model supports reasoning
        const modelParams: Record<string, unknown> = {};
        if (effort) {
          let supportsReasoning = true;
          if (model) {
            try {
              type ModelLite = { id: string; supports_reasoning: boolean };
              type ModelListResponse = { models: ModelLite[]; default_model: string };
              const cached = queryClient.getQueryData<ModelListResponse>(queryKeys.models.all);
              let models = cached?.models;
              if (!models) {
                const fetched = await apiFetch<ModelListResponse>("/api/models");
                queryClient.setQueryData(queryKeys.models.all, fetched);
                models = fetched.models;
              }
              const selected = models?.find((m) => m.id === model);
              if (selected) supportsReasoning = !!selected.supports_reasoning;
            } catch {
              // Best-effort only: keep supportsReasoning=true fallback
            }
          }
          if (supportsReasoning) {
            modelParams.reasoning_effort = effort;
          }
        }

        // Determine uploaded file info to send with the stream request
        interface UploadedFileInfo {
          filename: string;
          virtual_path: string;
          size: number;
          mime_type: string;
        }
        let uploadedFiles: UploadedFileInfo[] | undefined;
        let uploadError: string | undefined;

        // If files are File objects (not yet uploaded), upload them first with progress
        if (files && files.length > 0 && files[0] instanceof File) {
          const rawFiles = files as File[];

          // ── Optimistic message: create immediately with "uploading" status ──
          const optimisticFiles = rawFiles.map((f) => ({
            filename: f.name,
            virtual_path: "",
            size: f.size,
            uploadStatus: "uploading" as const,
            uploadProgress: 0,
          }));

          const { messages: currentMessages } = useChatStore.getState();
          const alreadyExists = currentMessages.some(
            (m) => m.role === "user" && m.content === message,
          );
          if (!alreadyExists) {
            addMessage({
              role: "user",
              content: message,
              timestamp: new Date().toISOString(),
              attachedFiles: optimisticFiles,
            });
          }

          const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
          const uploadUrl = `${gatewayUrl}/api/threads/${threadId}/uploads`;

          // Use XMLHttpRequest for upload progress tracking
          uploadedFiles = await new Promise<UploadedFileInfo[]>((resolve, reject) => {
            const formData = new FormData();
            rawFiles.forEach((f) => formData.append("files", f));

            const xhr = new XMLHttpRequest();
            xhr.open("POST", uploadUrl);
            if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

            // Track upload progress — update message in real-time
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const { messages: msgs } = useChatStore.getState();
                const lastUser = msgs[msgs.length - 1];
                if (lastUser?.role === "user" && lastUser.attachedFiles) {
                  const updatedFiles = lastUser.attachedFiles.map((f) => ({
                    ...f,
                    uploadProgress: percent,
                  }));
                  const newMsgs = [...msgs];
                  newMsgs[msgs.length - 1] = { ...lastUser, attachedFiles: updatedFiles };
                  setMessages(newMsgs);
                }
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText);
                  // Save complete file info from backend response
                  const fileInfoList = (data.files || []).map((f: any) => ({
                    filename: f.filename,
                    virtual_path: f.virtual_path,
                    size: f.size,
                    mime_type: f.mime_type,
                  }));
                  resolve(fileInfoList);
                } catch {
                  reject(new Error("上传响应解析失败"));
                }
              } else {
                reject(new Error(`上传失败: ${xhr.status}`));
              }
            });

            xhr.addEventListener("error", () => {
              reject(new Error("网络错误，上传失败"));
            });

            xhr.addEventListener("abort", () => {
              reject(new Error("上传已取消"));
            });

            xhr.send(formData);
          });

          if (!uploadedFiles || uploadedFiles.length === 0) {
            uploadError = "文件上传失败";
          }
        } else if (files && files.length > 0) {
          // Already uploaded paths (strings) — fallback for string-based file refs
          uploadedFiles = (files as string[]).map((p) => ({
            filename: p.split("/").pop() || p,
            virtual_path: p,
            size: 0,
            mime_type: "",
          }));
        }

        // ── Update message with final upload status ──
        if (files && files.length > 0 && files[0] instanceof File) {
          const { messages: msgs } = useChatStore.getState();
          const lastUser = msgs[msgs.length - 1];
          if (lastUser?.role === "user" && lastUser.attachedFiles) {
            const updatedFiles = lastUser.attachedFiles.map((f, i) => {
              if (uploadError) {
                return { ...f, uploadStatus: "error" as const, errorMessage: uploadError };
              }
              const uploaded = uploadedFiles?.[i];
              return {
                ...f,
                uploadStatus: "success" as const,
                virtual_path: uploaded?.virtual_path || f.virtual_path,
                size: uploaded?.size ?? f.size,
                uploadProgress: 100,
              };
            });
            const newMsgs = [...msgs];
            newMsgs[msgs.length - 1] = { ...lastUser, attachedFiles: updatedFiles };
            setMessages(newMsgs);
          }

          // If upload failed, stop here — do not send stream request
          if (uploadError) {
            toast.error(uploadError);
            setIsStreaming(false);
            setStreaming(false);
            return;
          }
        }

        // Add user message if not already added (no files case)
        if (!files || files.length === 0) {
          const { messages: currentMessages } = useChatStore.getState();
          const alreadyExists = currentMessages.some(
            (m) => m.role === "user" && m.content === message,
          );
          if (!alreadyExists) {
            addMessage({
              role: "user",
              content: message,
              timestamp: new Date().toISOString(),
            });
          }
        }

        const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            message,
            // Backend expects files as list[dict] with 'virtual_path' key
            files: uploadedFiles ? uploadedFiles.map((f) => ({ virtual_path: f.virtual_path })) : [],
            model: model || undefined,
            model_params: Object.keys(modelParams).length > 0 ? modelParams : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          // FastAPI HTTPException wraps error info in {detail: {code, message, status}}
          const detail = errorData?.detail || errorData;
          const code = detail?.code || "";
          const msg = detail?.message || `Stream failed: ${response.status}`;

          // ── Blockable errors: rate-limit, balance, subscription ──
          if (response.status === 429 || response.status === 402 || response.status === 403) {
            // Friendly Chinese messages for common error codes
            let friendlyMsg = msg;
            if (code === "RATE_LIMITED_PER_MINUTE") {
              friendlyMsg = "当前使用频率过高，请稍后再试";
            } else if (code === "RATE_LIMITED_PER_DAY") {
              friendlyMsg = "今日 Token 用量已达上限，请明天再试";
            } else if (code === "RATE_LIMITED_REQUESTS_5H") {
              friendlyMsg = "近 5 小时请求次数已达上限，请稍后再试";
            } else if (code === "RATE_LIMITED_REQUESTS_WEEK") {
              friendlyMsg = "本周请求次数已达上限，请下周再试";
            } else if (code === "INSUFFICIENT_BALANCE") {
              friendlyMsg = "余额不足，请充值后继续使用";
            } else if (code === "SUBSCRIPTION_EXPIRED") {
              friendlyMsg = "订阅已过期，请续费";
            } else if (response.status === 429) {
              friendlyMsg = "请求过于频繁，请稍后再试";
            } else if (response.status === 402) {
              friendlyMsg = "余额不足，请充值后继续使用";
            } else if (response.status === 403) {
              friendlyMsg = "账号已被禁用，请联系管理员";
            }

            toast.error(friendlyMsg, { duration: 6000 });
            // Keep the user message visible; add an error reply in the conversation
            const { messages: curMsgs } = useChatStore.getState();
            setMessages([
              ...curMsgs,
              {
                role: "assistant",
                content: `⚠️ ${friendlyMsg}`,
                timestamp: new Date().toISOString(),
                isError: true,
                retryMessage: message,
              },
            ]);
            setIsStreaming(false);
            setStreaming(false);
            onBlocked?.({ code, message: friendlyMsg, status: response.status });
            return;
          }

          toast.error(msg);
          // Show error in conversation (not just toast)
          const { messages: errMsgs2 } = useChatStore.getState();
          setMessages([
            ...errMsgs2,
            {
              role: "assistant",
              content: `⚠️ ${msg}`,
              timestamp: new Date().toISOString(),
              isError: true,
              retryMessage: message,
            },
          ]);
          setIsStreaming(false);
          setStreaming(false);
          return;
        }

        // Process the response body as a stream
        processStream(response, message);
      } catch (err: any) {
        setIsStreaming(false);
        setStreaming(false);
        if (err.name !== "AbortError") {
          toast.error(err.message);
          // Show error in conversation
          const { messages: errMsgs3 } = useChatStore.getState();
          setMessages([
            ...errMsgs3,
            {
              role: "assistant",
              content: `⚠️ ${err.message}`,
              timestamp: new Date().toISOString(),
              isError: true,
              retryMessage: message,
            },
          ]);
        }
      }
    },
    [threadId, addMessage, setStreaming, addToolCall, updateToolCall, processStream, setMessages],
  );

  const cancelStream = useCallback(() => {
    flushTypeQueue();
    // Clear any remaining queues
    typeQueueRef.current.length = 0;
    thinkingQueueRef.current.length = 0;
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    abortRef.current?.abort();
    lastSubagentOpId.current = "";
    setIsStreaming(false);
    setStreaming(false);
    setThreadStatus(threadId, "");
  }, [flushTypeQueue, threadId, setThreadStatus]);

  return { isStreaming, sendMessage, cancelStream };
}
