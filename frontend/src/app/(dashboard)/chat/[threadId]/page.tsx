"use client";

import { ChatContainer } from "@/components/chat/chat-container";
import { useEvoStream } from "@/hooks/use-evo-stream";
import { useChatStore, parseFileReferences } from "@/store/chat-store";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { threadsApi } from "@/lib/api";
import { toast } from "sonner";
import { ChatHeader } from "@/components/chat/chat-header";

export default function ChatPage() {
  return (
    <>
      <ChatHeader />
      <ChatPageInner />
    </>
  );
}

function ChatPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = params.threadId as string;
  const initialPrompt = searchParams.get("prompt");
  const initialModel = searchParams.get("model");
  const initialEffort = searchParams.get("effort");
  const initialFiles = searchParams.get("files");
  const { reset, setMessages, isLoadingHistory, setHistoryLoading, setOptimisticMessage, setTurnUsage, setCancelStreamFn } = useChatStore();

  // 在组件初始化时，使用 window.location 直接检查 URL 参数（避免 useSearchParams 延迟解析导致的问题）
  const hasPromptInUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).has("prompt")
    : !!initialPrompt;

  // Track a per-threadId mount counter to detect thread changes synchronously.
  // This ensures that when threadId changes (sidebar navigation), we set isLoadingHistory = true
  // BEFORE the browser paints, preventing a flash of WelcomeScreen.
  // Also handles the initial mount case where reset() may have set isLoadingHistory = false.
  const prevThreadIdRef = useRef<string | null>(null);
  const threadChanged = prevThreadIdRef.current !== threadId;
  if (threadChanged) {
    prevThreadIdRef.current = threadId;
  }
  // useLayoutEffect runs synchronously after render but before paint
  useLayoutEffect(() => {
    if (threadChanged && !hasPromptInUrl) {
      setHistoryLoading(true);
    }
  }, [threadChanged, hasPromptInUrl, setHistoryLoading]);

  // Use sessionStorage for auto-send guard so it survives React StrictMode remounts
  const storageKey = `autoSent_${threadId}`;
  const isAutoSent = typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1";
  const autoSentRef = useRef(isAutoSent);
  // 如果 URL 有 prompt 参数，初始设为 true，防止加载历史的 useEffect 清空消息
  const hasSentMessageRef = useRef(hasPromptInUrl);

  // 切换对话时重置 refs（但需要重新检查 URL 参数）
  useEffect(() => {
    const storageKey = `autoSent_${threadId}`;
    autoSentRef.current = typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1";
    hasSentMessageRef.current = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).has("prompt")
      : false;
  }, [threadId]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("model") || "");
  const [selectedEffort, setSelectedEffort] = useState<"low" | "medium" | "high">(
    () => (localStorage.getItem("reasoning_effort") as "low" | "medium" | "high") || "medium"
  );

  const { isStreaming, sendMessage, cancelStream } = useEvoStream({
    threadId,
    onDone: () => {},
    onError: () => {},
    onBlocked: () => {},
  });

  // Register cancelStream in global store so sidebar can access it
  useEffect(() => {
    setCancelStreamFn(() => cancelStream);
    return () => setCancelStreamFn(null);
  }, [cancelStream, setCancelStreamFn]);

  // 自动发送从 /chat 页面带来的初始 prompt
  // 使用 window.location.search 直接读取 URL，避免 useSearchParams 延迟解析的问题
  const [hasInitialPrompt, setHasInitialPrompt] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return !!params.get("prompt");
    }
    return false;
  });
  const [isInitializing, setIsInitializing] = useState(hasInitialPrompt);

  // 加载历史消息 — 仅在非初始化状态下加载
  useEffect(() => {
    // 如果是新对话（有 initialPrompt）或正在初始化，不加载历史
    // hasSentMessageRef 防止 router.replace 清除 URL 参数后 initialPrompt 变为 null、
    // 同时 isInitializing 已被 isStreaming 置为 false 的竞态条件下，错误地清空消息
    if (initialPrompt || isInitializing || hasSentMessageRef.current) return;

    // 始终先清空旧消息，避免快速切换时的竞态条件
    setMessages([]);
    setHistoryLoading(true);

    // 闭包捕获当前 threadId，用于异步回调中的一致性校验
    const targetThreadId = threadId;
    let cancelled = false;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const data = await threadsApi.getMessages(targetThreadId);
        if (!cancelled) {
          // 增强消息：(1) 解析文件引用 (2) 从 usage_metadata 恢复 tokenUsage (3) 恢复 thinking
          const enhancedMessages = data.messages.map((msg: any) => {
            let enhanced = { ...msg };
            // 文件引用增强
            if (msg.role === "user" && !msg.attachedFiles && msg.content) {
              const parsedFiles = parseFileReferences(msg.content);
              if (parsedFiles.length > 0) {
                enhanced = { ...enhanced, attachedFiles: parsedFiles };
              }
            }
            // 从后端 usage_metadata 恢复每条消息的 token 统计
            if (msg.role === "assistant" && !msg.tokenUsage && msg.usage_metadata) {
              const um = msg.usage_metadata;
              enhanced = {
                ...enhanced,
                tokenUsage: {
                  inputTokens: um.input_tokens || 0,
                  outputTokens: um.output_tokens || 0,
                  totalTokens: um.total_tokens || (um.input_tokens || 0) + (um.output_tokens || 0),
                  model: um.model || undefined,
                },
              };
            }
            // 恢复 thinking 内容和耗时（后端消息 JSON 已包含 thinking + thinking_duration_ms）
            if (msg.role === "assistant" && msg.thinking) {
              enhanced = {
                ...enhanced,
                thinking: msg.thinking,
                thinkingDurationMs: msg.thinking_duration_ms || undefined,
              };
            }
            return enhanced;
          });
          // 双重校验：(1) messages 为空（避免覆盖流式消息）(2) URL 中的 threadId 仍然匹配（避免快速切换竞态）
          const { messages: msgs } = useChatStore.getState();
          const currentUrlThreadId = window.location.pathname.split("/chat/")[1]?.split("/")[0];
          if (msgs.length === 0 && currentUrlThreadId === targetThreadId) {
            setMessages(enhancedMessages);
          }
          
          // 获取该对话的累计 token 统计（用于 setTurnUsage 基数）
          try {
            const tokenData = await threadsApi.getTokenUsage(targetThreadId);
            if (!cancelled && tokenData && tokenData.thread) {
              setTurnUsage(
                tokenData.thread.input_tokens,
                tokenData.thread.output_tokens,
                undefined,
                undefined
              );
            }
          } catch (e) {
            // 忽略 token 统计获取失败
          }
        }
      } catch (e: any) {
        if (!cancelled && e.status !== 404) {
          toast.error("Failed to load history messages");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
    // 注意：只在 threadId 或 initialPrompt 变化时执行，避免 setMessages 引起变化导致重复
    // IMPORTANT: isInitializing is intentionally excluded from deps. When it changes from
    // true → false during a new-conversation flow, re-running this effect would call
    // setMessages([]) and wipe messages that are being actively streamed.
  }, [threadId, initialPrompt]);

  // 自动发送从 /chat 页面带来的初始 prompt
  useEffect(() => {
    if (initialPrompt && !autoSentRef.current && !isStreaming) {
      autoSentRef.current = true;
      // Persist to sessionStorage so it survives StrictMode remounts
      sessionStorage.setItem(storageKey, "1");
      hasSentMessageRef.current = true;
      // 清除乐观更新消息
      setOptimisticMessage(null);
      router.replace(`/chat/${threadId}`);
      // 解析文件路径
      let files: string[] | undefined;
      if (initialFiles) {
        files = initialFiles.split(",");
      }
      sendMessage(initialPrompt, files, initialModel || "", initialEffort || "medium");
    }
  }, []);

  // 当 isStreaming 变为 true 时，说明 sendMessage 已开始工作，isInitializing 可以设为 false
  useEffect(() => {
    if (isStreaming && isInitializing) {
      setIsInitializing(false);
    }
  }, [isStreaming, isInitializing]);

  return (
    <ChatContainer
      threadId={threadId}
      onSendMessage={(msg, files, model, effort) => sendMessage(msg, files, model, effort)}
      onCancelStream={cancelStream}
      selectedModel={selectedModel}
      selectedEffort={selectedEffort}
      onModelChange={setSelectedModel}
      onEffortChange={(e) => setSelectedEffort(e as "low" | "medium" | "high")}
      isInitializing={isInitializing}
    />
  );
}
