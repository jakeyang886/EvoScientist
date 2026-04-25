"use client";

import { User, Sparkles, Brain, ChevronDown, ChevronRight, Wrench, Bot, FileText, CheckCircle2, AlertCircle, Loader2, Eye, Code2, Zap, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { MarkdownRender } from "./markdown-render";
import { FileAttachmentCard, ParsedFileAttachments } from "./file-reference";
import { ThinkingIndicator } from "./thinking-indicator";
import type { OperationItem, AttachedFile } from "@/store/chat-store";

interface MessageBubbleProps {
  message: {
    role: string;
    content: string;
    timestamp: string;
    thinking?: string;
    thinkingDurationMs?: number;
    tool_calls?: any[];
    operations?: OperationItem[];
    attachedFiles?: AttachedFile[];
    isError?: boolean;
  /** Original user message to retry (set only on error messages) */
  retryMessage?: string;
  };
  isLatest: boolean;
  isStreaming?: boolean;
  threadId?: string | null;
  onRetry?: (message: string) => void;
  // Token usage for this message (only available for latest assistant message during/after streaming)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd?: number;
    model?: string;
  };
}

function OperationIcon({ type }: { type: string }) {
  if (type === "subagent") return <Bot className="w-3.5 h-3.5" />;
  if (type === "file") return <FileText className="w-3.5 h-3.5" />;
  return <Wrench className="w-3.5 h-3.5" />;
}

function OperationStatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
  if (status === "success") return <CheckCircle2 className="w-3 h-3 text-green-500" />;
  if (status === "error") return <AlertCircle className="w-3 h-3 text-red-500" />;
  return null;
}

function OperationDetailPanel({ op }: { op: OperationItem }) {
  const [showArgs, setShowArgs] = useState(false);
  const [showResult, setShowResult] = useState(false);

  if (!op.args && !op.result) return null;

  return (
    <div className="mt-1.5 ml-5 space-y-1 border-l-2 border-zinc-200 dark:border-zinc-700 pl-3">
      {op.args && Object.keys(op.args).length > 0 && (
        <div>
          <button
            onClick={() => setShowArgs(!showArgs)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <Code2 className="w-3 h-3" />
            <span>参数 {showArgs ? "收起" : "展开"}</span>
            {showArgs ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
          {showArgs && (
            <pre className="mt-1 p-2 text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-x-auto whitespace-pre-wrap break-all font-mono text-zinc-700 dark:text-zinc-300">
              {JSON.stringify(op.args, null, 2)}
            </pre>
          )}
        </div>
      )}
      {op.result && (
        <div>
          <button
            onClick={() => setShowResult(!showResult)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <Eye className="w-3 h-3" />
            <span>结果 {showResult ? "收起" : "展开"}</span>
            {showResult ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
          {showResult && (
            <pre className="mt-1 p-2 text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-x-auto whitespace-pre-wrap break-all font-mono text-zinc-700 dark:text-zinc-300 max-h-40 overflow-y-auto">
              {op.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** 文件上传状态卡片 — 显示上传中/失败状态 */
function FileUploadCard({ file }: { file: AttachedFile }) {
  const isUploading = file.uploadStatus === "uploading";
  const isError = file.uploadStatus === "error";
  const progress = file.uploadProgress ?? 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
      isUploading ? "border-blue-300/50 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20" :
      isError ? "border-red-300/50 dark:border-red-500/30 bg-red-50/50 dark:bg-red-950/20" :
      "border-border bg-accent/10"
    }`}>
      {isUploading ? (
        <Loader2 className="w-3.5 h-3.5 shrink-0 text-blue-500 animate-spin" />
      ) : isError ? (
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
      ) : (
        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium truncate">{file.filename}</span>
          {isUploading && (
            <span className="text-[10px] text-blue-500 ml-2 shrink-0">{progress}%</span>
          )}
          {isError && (
            <span className="text-[10px] text-red-500 ml-2 shrink-0">失败</span>
          )}
        </div>
        {isUploading && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {isError && file.errorMessage && (
          <div className="text-[10px] text-red-400 mt-1">{file.errorMessage}</div>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({ message, isLatest, isStreaming, threadId, tokenUsage, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [thinkingExpanded, setThinkingExpanded] = useState(!!message.thinking);
  const [opsExpanded, setOpsExpanded] = useState(true); // 默认展开
  const thinkingStartRef = useRef<number | null>(null);
  const [liveThinkingMs, setLiveThinkingMs] = useState<number>(0);

  // 流式完成后自动折叠操作面板
  useEffect(() => {
    if (!isStreaming && message.operations && message.operations.length > 0) {
      const hasRunning = message.operations.some((o) => o.status === "running");
      if (!hasRunning) {
        setOpsExpanded(false);
      }
    }
  }, [isStreaming, message.operations]);

  // 流式期间保持思考展开 + 追踪思考耗时
  useEffect(() => {
    if (isStreaming && message.thinking) {
      setThinkingExpanded(true);
      // 记录思考开始时间（仅首次）
      if (!thinkingStartRef.current) {
        thinkingStartRef.current = Date.now();
      }
    }
    // 当思考结束（content 开始出现或流结束），记录耗时
    if (!isStreaming && thinkingStartRef.current) {
      thinkingStartRef.current = null;
    }
  }, [isStreaming, message.thinking]);

  // 实时更新思考耗时计时器
  useEffect(() => {
    if (!isStreaming || !thinkingStartRef.current || message.content) return;
    const timer = setInterval(() => {
      if (thinkingStartRef.current) {
        setLiveThinkingMs(Date.now() - thinkingStartRef.current);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [isStreaming, message.content]);

  // 自动展开操作面板当有新操作时
  useEffect(() => {
    if (isStreaming && message.operations && message.operations.length > 0) {
      setOpsExpanded(true);
    }
  }, [isStreaming, message.operations?.length]);

  const hasOperations = message.operations && message.operations.length > 0;
  const hasRunning = hasOperations && message.operations!.some((o) => o.status === "running");

  return (
    <div className={`flex gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
        isUser
          ? "bg-gradient-to-br from-violet-500 to-indigo-500"
          : "bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800"
      }`}>
        {isUser ? (
          <User className="w-3.5 h-3.5 text-white" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
        )}
      </div>

      {/* Content */}
      <div className={`max-w-[75%] min-w-0`}>
        {/* File attachments — 用户消息显示 */}
        {isUser && message.attachedFiles && message.attachedFiles.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {message.attachedFiles.map((file, i) => {
              // 上传中或失败 → 用 FileUploadCard
              if (file.uploadStatus === "uploading" || file.uploadStatus === "error") {
                return (
                  <FileUploadCard
                    key={`upload-${i}`}
                    file={file}
                  />
                );
              }
              // 上传成功 → 用 FileAttachmentCard（可预览/下载）
              return (
                <FileAttachmentCard
                  key={`${file.virtual_path}-${i}`}
                  filename={file.filename}
                  virtualPath={file.virtual_path}
                  size={file.size}
                  threadId={threadId ?? null}
                />
              );
            })}
          </div>
        )}

        {/* 旧消息兼容：从 content 中解析 [File: xxx] */}
        {isUser && (!message.attachedFiles || message.attachedFiles.length === 0) && (
          <ParsedFileAttachments content={message.content} threadId={threadId ?? null} />
        )}

        {/* Thinking section */}
        {message.thinking && (
          <div className="mb-2 rounded-lg border border-dashed border-violet-300/50 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-950/20 overflow-hidden">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>思考过程</span>
              {(message.thinkingDurationMs || (isStreaming && liveThinkingMs > 0)) && (
                <span className="flex items-center gap-0.5 text-[10px] text-violet-500/70 dark:text-violet-400/60">
                  <Clock className="w-2.5 h-2.5" />
                  {((message.thinkingDurationMs || liveThinkingMs) / 1000).toFixed(1)}s
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {thinkingExpanded ? "点击收起" : "点击展开"}
              </span>
              {thinkingExpanded ? (
                <ChevronDown className="w-3 h-3 ml-auto" />
              ) : (
                <ChevronRight className="w-3 h-3 ml-auto" />
              )}
            </button>

            {thinkingExpanded && (
              <div className="px-3 pb-3 text-xs text-violet-700/80 dark:text-violet-300/80 border-t border-violet-200/50 dark:border-violet-800/30 pt-2">
                <div className="thinking-markdown prose prose-xs prose-violet dark:prose-invert max-w-none [&_p]:text-violet-700/80 dark:[&_p]:text-violet-300/80 [&_li]:text-violet-700/80 dark:[&_li]:text-violet-300/80 [&_code]:text-violet-800 dark:[&_code]:text-violet-200 [&_pre]:bg-violet-100/50 dark:[&_pre]:bg-violet-900/20">
                  <MarkdownRender content={message.thinking} threadId={threadId} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Operations panel */}
        {hasOperations && (
          <div className={`mb-2 rounded-lg border overflow-hidden ${
            hasRunning
              ? "border-blue-300/50 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20"
              : "border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30"
          }`}>
            <button
              onClick={() => setOpsExpanded(!opsExpanded)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 transition-colors"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>执行操作 ({message.operations!.length})</span>
              {hasRunning && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              )}
              {opsExpanded ? (
                <ChevronDown className="w-3 h-3 ml-auto" />
              ) : (
                <ChevronRight className="w-3 h-3 ml-auto" />
              )}
            </button>

            {opsExpanded && (
              <div className="px-3 pb-2 space-y-1.5 border-t border-zinc-200/50 dark:border-zinc-700/30 pt-2">
                {message.operations!.map((op, i) => (
                  <div key={`${op.id}-${op.type}-${i}`} className="text-xs">
                    <div className="flex items-center gap-2">
                      <OperationStatusIcon status={op.status} />
                      <OperationIcon type={op.type} />
                      <span className="flex-1 truncate font-medium">{op.name}</span>
                      <span className={`text-[10px] font-medium ${
                        op.status === "success" ? "text-green-600 dark:text-green-400" :
                        op.status === "error" ? "text-red-600 dark:text-red-400" :
                        "text-blue-600 dark:text-blue-400 animate-pulse"
                      }`}>
                        {op.status === "running" ? "运行中" : op.status === "success" ? "完成" : "失败"}
                      </span>
                    </div>
                    {(op.args || op.result) && <OperationDetailPanel op={op} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error message highlight */}
        {message.isError && (
          <div className="mb-2 px-3 py-2 rounded-lg border border-red-300/60 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{message.content}</p>
            {onRetry && message.retryMessage && (
              <button
                onClick={() => onRetry(message.retryMessage!)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重试
              </button>
            )}
          </div>
        )}

        {/* Main text content */}
        <div className="text-sm leading-relaxed">
          {message.content && !message.isError ? (
            <MarkdownRender content={message.content} threadId={threadId} />
          ) : isStreaming && isLatest ? (
            <ThinkingIndicator />
          ) : null}
        </div>
        {isStreaming && isLatest && message.content && (
          <span className="inline-block w-0.5 h-4 -ml-0.5 bg-primary animate-pulse rounded-full align-text-bottom" />
        )}

        {/* Token usage indicator - show for assistant messages with token data */}
        {!isUser && tokenUsage && tokenUsage.totalTokens > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Zap className="w-3 h-3" />
              <span>
                {tokenUsage.inputTokens.toLocaleString()} in / {tokenUsage.outputTokens.toLocaleString()} out
              </span>
              <span className="font-medium">
                ({tokenUsage.totalTokens.toLocaleString()} tokens)
              </span>
            </div>
            {(tokenUsage.costUsd !== undefined || tokenUsage.model) && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                {tokenUsage.model && (
                  <span className="bg-muted/50 px-1.5 py-0.5 rounded">{tokenUsage.model}</span>
                )}
                {tokenUsage.costUsd !== undefined && (
                  <span>${tokenUsage.costUsd.toFixed(6)}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
