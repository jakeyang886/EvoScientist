"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "./message-bubble";
import { ThinkingIndicator } from "./thinking-indicator";
import { PromptInput } from "./prompt-input/prompt-input";
import { WelcomeScreen } from "./welcome-screen";
import { ArtifactsPanel } from "./artifacts-panel";
import { Loader2, GripVertical } from "lucide-react";
import type { PromptInputHandle } from "./prompt-input/prompt-input";

interface ChatContainerProps {
  threadId: string;
  onSendMessage: (message: string, files?: any[], model?: string, effort?: string) => void;
  onCancelStream: () => void;
  selectedModel: string;
  selectedEffort: string;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
  isInitializing?: boolean;
}

export function ChatContainer({
  threadId,
  onSendMessage,
  onCancelStream,
  selectedModel,
  selectedEffort,
  onModelChange,
  onEffortChange,
  isInitializing,
}: ChatContainerProps) {
  const { messages, isStreaming, isLoadingHistory, optimisticMessage, currentTurnUsage } = useChatStore();
  const activeArtifact = useChatStore((s) => s.activeArtifact);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewContent, setHasNewContent] = useState(false);
  const promptInputRef = useRef<PromptInputHandle>(null);
  // Track the previous threadId to detect thread switches — when switching threads
  // we must unconditionally scroll to bottom once history finishes loading.
  const prevThreadIdRef = useRef(threadId);

  // ─── Artifacts 宽度拖拽调整 ───
  const ARTIFACTS_DEFAULT_WIDTH = 480;
  const ARTIFACTS_MIN_WIDTH = 280;
  const CHAT_MIN_WIDTH = 100;
  const [artifactsWidth, setArtifactsWidth] = useState(ARTIFACTS_DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const artifactsPanelRef = useRef<HTMLElement | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    // 缓存容器宽度，避免每帧 getBoundingClientRect 触发 reflow
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const maxAllowed = containerWidth - CHAT_MIN_WIDTH;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // 找到 artifacts panel DOM 节点，用于直接操作 style
    // 它是 resize handle 的下一个兄弟元素
    const handleEl = e.currentTarget as HTMLElement;
    const panelEl = handleEl.nextElementSibling as HTMLElement | null;
    artifactsPanelRef.current = panelEl;

    const startX = e.clientX;
    const startWidth = artifactsWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = startWidth + delta;
      const clamped = Math.max(ARTIFACTS_MIN_WIDTH, Math.min(maxAllowed, newWidth));
      // 直接写 DOM style，跳过 React 渲染循环，保证流畅
      if (artifactsPanelRef.current) {
        artifactsPanelRef.current.style.width = `${clamped}px`;
      }
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // 读取最终宽度，同步回 React state
      const finalWidth = artifactsPanelRef.current?.offsetWidth ?? artifactsWidth;
      setArtifactsWidth(finalWidth);
      artifactsPanelRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [artifactsWidth]);

  // Track scroll position
  const handleScroll = () => {
    const el = chatAreaRef.current;
    if (!el) return;
    // Consider "near bottom" if within 80px of the end
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsNearBottom(isAtBottom);
    if (isAtBottom) setHasNewContent(false);
  };

  // Auto-scroll only if user is near bottom
  useEffect(() => {
    if (messagesEndRef.current && isNearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
    } else if (!isNearBottom && isStreaming) {
      setHasNewContent(true);
    }
  }, [messages, isStreaming, isNearBottom]);

  // When threadId changes, reset scroll state
  useEffect(() => {
    prevThreadIdRef.current = threadId;
    setIsNearBottom(true);
    setHasNewContent(false);
  }, [threadId]);

  // When history finishes loading after a thread switch, unconditionally scroll to bottom.
  // This handles the case where messages were loaded asynchronously and the auto-scroll
  // effect above may have already fired before messages were set.
  useEffect(() => {
    if (!isLoadingHistory && messages.length > 0 && prevThreadIdRef.current === threadId) {
      // Use requestAnimationFrame to ensure DOM has painted the messages
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
      });
      setIsNearBottom(true);
      setHasNewContent(false);
    }
  }, [isLoadingHistory, threadId, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsNearBottom(true);
    setHasNewContent(false);
  };

  return (
    <div ref={containerRef} className="flex h-full relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-[100px]">
        <div className="flex flex-col h-full relative">

      {/* Messages area */}
      <div
        ref={chatAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
        role="log"
        aria-live="polite"
      >
        {isLoadingHistory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          isInitializing || optimisticMessage || isStreaming ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <WelcomeScreen onSendMessage={(msg) => onSendMessage(msg)} />
          )
        ) : (
          <div className="max-w-3xl mx-auto py-4 space-y-4">
            {messages.map((msg, i) => {
              const isLatest = i === messages.length - 1;
              const isLatestAssistant = isLatest && msg.role === "assistant";
              // 优先使用消息自身保存的 tokenUsage，如果是最新 assistant 消息且正在流式，使用 currentTurnUsage
              const tokenUsage = msg.tokenUsage || (
                isLatestAssistant && (isStreaming || currentTurnUsage.totalTokens > 0)
                  ? currentTurnUsage
                  : undefined
              );

              return (
                <MessageBubble
                  key={`msg-${msg.role}-${msg.timestamp}-${i}`}
                  message={msg}
                  isLatest={isLatest}
                  isStreaming={isStreaming && isLatest}
                  threadId={threadId}
                  tokenUsage={tokenUsage}
                  onRetry={msg.isError ? (retryMsg: string) => {
                    // Remove the error message, then resend
                    const { messages: allMsgs } = useChatStore.getState();
                    useChatStore.getState().setMessages(allMsgs.slice(0, -1));
                    onSendMessage(retryMsg);
                  } : undefined}
                />
              );
            })}
            {/* Fallback thinking indicator: streaming in progress but no assistant message created yet */}
            {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
              <ThinkingIndicator className="px-4 py-3" />
            )}
            {/* Invisible anchor for auto-scroll */}
            <div ref={messagesEndRef} className="h-px" />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!isNearBottom && isStreaming && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-card border shadow-lg hover:bg-accent/80 transition-colors"
        >
          <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span className="text-xs font-medium">新内容</span>
          {hasNewContent && <span className="w-2 h-2 rounded-full bg-red-500" />}
        </button>
      )}

      {/* Input area — model selector is now inside PromptInput */}
      <div className="px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <PromptInput
            ref={promptInputRef}
            onSubmit={(msg, files) => onSendMessage(msg, files, selectedModel, selectedEffort)}
            onCancel={onCancelStream}
            disabled={isStreaming || isInitializing}
            isLoading={isStreaming || isInitializing}
            selectedModel={selectedModel}
            selectedEffort={selectedEffort as "low" | "medium" | "high"}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
          />
        </div>
      </div>
      
      </div>
      </div>

      {/* Resize Handle — 仅在 Artifacts 打开时显示 */}
      {activeArtifact && (
        <div
          onMouseDown={handleResizeStart}
          className="
            w-1.5 shrink-0 cursor-col-resize
            flex items-center justify-center
            hover:bg-violet-400/30 active:bg-violet-400/50
            group/resize select-none
          "
          title="拖拽调整宽度"
        >
          <GripVertical className="w-3 h-5 text-muted-foreground/40 group-hover/resize:text-violet-500" />
        </div>
      )}

      {/* Artifacts Panel */}
      <ArtifactsPanel width={artifactsWidth} />
    </div>
  );
}
