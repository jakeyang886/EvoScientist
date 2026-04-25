"use client";

import { useTranslation } from "react-i18next";
import { useThreads, useCreateThread, useDeleteThread, useRenameThread, useTokenUsageThreads, useTokenUsage, queryKeys } from "@/hooks/use-threads";
import { useChatStore } from "@/store/chat-store";
import { useRouter, usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Clock, MoreHorizontal, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { reset, setOptimisticMessage } = useChatStore();

  const handleNewChat = () => {
    // 清除当前对话状态和乐观消息，直接跳转到 /chat（无 UUID）
    setOptimisticMessage(null);
    reset();
    router.push("/chat");
  };

  return (
    <div className="px-2 py-2">
      <button
        onClick={handleNewChat}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg hover:bg-accent/60 transition-colors font-medium"
        style={{ color: "hsl(var(--sidebar-text))" }}
      >
        <MessageSquarePlus className="w-4 h-4 shrink-0" />
        {!collapsed && <span>{t("sidebar.newChat")}</span>}
      </button>
    </div>
  );
}

export function SidebarHistory({ collapsed, style }: { collapsed: boolean; style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const { data, isLoading } = useThreads();
  const deleteThread = useDeleteThread();
  const renameThread = useRenameThread();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { reset, threadStatuses } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { confirm, dialogProps, dialogState, handleConfirm, handleCancel } = useConfirmDialog();

  // Extract current threadId from URL: /chat/[threadId]
  const currentThreadId = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Fetch token usage per thread for the sidebar badge
  const { data: tokenData } = useTokenUsageThreads(50);
  // Fetch total and today token usage
  const { data: summaryData } = useTokenUsage(1); // 1 day to get today only

  // Build a Map<threadId, total_tokens> for O(1) lookup
  const tokenMap = useMemo(() => {
    const map = new Map<string, number>();
    if (tokenData?.threads) {
      for (const th of tokenData.threads) {
        if (th.total_tokens > 0) {
          map.set(th.thread_id, th.total_tokens);
        }
      }
    }
    return map;
  }, [tokenData]);

  // Calculate total tokens across all threads
  const totalTokens = useMemo(() => {
    if (!tokenData?.threads) return 0;
    return tokenData.threads.reduce((sum, th) => sum + th.total_tokens, 0);
  }, [tokenData]);

  // Today's tokens
  const todayTokens = summaryData?.today?.total_tokens || 0;

  const threads = data?.threads || [];

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("sidebar.delete") || "Delete",
      description: t("sidebar.deleteConfirm") || "Are you sure?",
      confirmLabel: t("sidebar.delete") || "Delete",
      cancelLabel: t("common.cancel") || "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteThread.mutateAsync(id);
      toast.success(t("common.delete") + " OK");
      // If deleting the currently viewed thread, navigate to /chat
      if (currentThreadId === id) {
        reset();
        router.push("/chat");
      }
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    await renameThread.mutateAsync({ id, title: editTitle });
    setEditingId(null);
  };

  return (
    <div className="flex flex-col min-h-0" style={style ?? { flex: "0 0 55%" }}>
      {!collapsed && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 shrink-0" style={{ color: "hsl(var(--sidebar-muted))" }}>
          <Clock className="w-3 h-3" />
          <div className="text-[10px] font-semibold uppercase tracking-wider">
            {t("sidebar.recentChats")}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1">
        <div className="space-y-0.5">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t("common.loading")}</div>
          )}
          {threads.map((thread) => {
            const tokens = tokenMap.get(thread.thread_id);
            return (
              <div
                key={thread.thread_id}
                onMouseEnter={() => setActiveId(thread.thread_id)}
                onMouseLeave={() => setActiveId(null)}
                className={`group flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg cursor-pointer transition-all duration-150 ${
                  currentThreadId === thread.thread_id
                    ? "bg-accent font-medium"
                    : activeId === thread.thread_id
                      ? "bg-accent/60"
                      : ""
                }`}
                onClick={() => {
                  // Refresh thread list on navigation
                  queryClient.invalidateQueries({ queryKey: queryKeys.threads.list() });

                  // If clicking the already-active thread, skip navigation entirely
                  if (currentThreadId === thread.thread_id) return;

                  // Cancel any running stream on the current thread before switching
                  if (currentThreadId) {
                    const { threadStatuses, cancelStreamFn } = useChatStore.getState();
                    if (threadStatuses[currentThreadId] === "running") {
                      cancelStreamFn?.();
                    }
                  }
                  // Reset all chat state (artifacts, fileCache, tokenUsage, optimisticMessage, etc.)
                  // to prevent stale data from the previous thread appearing during the switch.
                  // Set isLoadingHistory = true immediately so ChatContainer shows a spinner
                  // instead of WelcomeScreen during the route transition.
                  reset();
                  useChatStore.getState().setHistoryLoading(true);
                  router.push(`/chat/${thread.thread_id}`);
                }}
                style={{ color: "hsl(var(--sidebar-text))" }}
              >
                {threadStatuses[thread.thread_id] === "running" ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500" />
                ) : (
                  <MessageSquarePlus className="w-3.5 h-3.5 shrink-0 opacity-40" />
                )}
                {editingId === thread.thread_id ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      className="flex-1 text-sm bg-background/80 border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleRename(thread.thread_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(thread.thread_id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRename(thread.thread_id);
                      }}
                      className="p-0.5 hover:bg-muted rounded"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="flex-1 truncate text-sm">{thread.title}</span>
                )}
                {/* Token badge: show when hover or always for collapsed */}
                {!collapsed && !editingId && (
                  <span
                    className={`shrink-0 text-[10px] tabular-nums transition-opacity ${
                      activeId === thread.thread_id
                        ? "opacity-70"
                        : "opacity-0 group-hover:opacity-70"
                    }`}
                    style={{ color: "hsl(var(--sidebar-muted))" }}
                  >
                    {tokens != null ? formatTokenCount(tokens) : ""}
                  </span>
                )}
                {!collapsed && (activeId === thread.thread_id || currentThreadId === thread.thread_id) && editingId !== thread.thread_id && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(thread.thread_id);
                        setEditTitle(thread.title);
                      }}
                      className="p-1 hover:bg-muted/80 rounded text-muted-foreground"
                      title={t("sidebar.rename")}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, thread.thread_id)}
                      className="p-1 hover:bg-muted/80 rounded text-muted-foreground hover:text-red-500"
                      title={t("sidebar.delete")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && threads.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {t("sidebar.noConversations") || "暂无对话"}
            </div>
          )}
        </div>
      </div>
      {/* Token Usage Summary - show total and today's tokens */}
      {!collapsed && totalTokens > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-border/50">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t("tokenStats.total") || "合计"}</span>
            <span className="font-medium tabular-nums">{formatTokenCount(totalTokens)}</span>
          </div>
          {todayTokens > 0 && (
            <div className="flex items-center justify-between text-[11px] mt-1">
              <span className="text-muted-foreground">{t("tokenStats.today") || "今日"}</span>
              <span className="font-medium tabular-nums text-violet-500">{formatTokenCount(todayTokens)}</span>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog dialogProps={dialogProps} dialogState={dialogState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
