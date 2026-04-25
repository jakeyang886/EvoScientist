"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, ArrowLeft, Clock } from "lucide-react";

interface RunningThread {
  user_uid: string;
  started_at: string;
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt + (startedAt.includes("Z") ? "" : "Z"));
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs < 0) return "0s";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

export default function AdminThreadsPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "running-threads"],
    queryFn: () => adminApi.runningThreads(),
    refetchInterval: 5000,
  });

  const threads = data?.threads ?? {};
  const entries = Object.entries(threads) as [string, RunningThread][];
  const count = entries.length;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{t("admin.threads.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("admin.threads.subtitle")}</p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            {count > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${count > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          </span>
          <span className="text-muted-foreground">{t("admin.threads.autoRefresh")}</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("admin.threads.loading")}
          </div>
        ) : error ? (
          <div className="rounded-xl border bg-card p-4 text-center text-sm text-destructive">
            {t("admin.threads.loadFailed")}
          </div>
        ) : count === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <Activity className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("admin.threads.noThreads")}</p>
          </div>
        ) : (
          <section className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.threads.threadId")}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.threads.userUid")}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.threads.startedAt")}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {t("admin.threads.duration")}
                    </span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.threads.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([threadId, info]) => (
                  <tr key={threadId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs" title={threadId}>
                      {shortId(threadId)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground" title={info.user_uid}>
                      {info.user_uid ? shortId(info.user_uid) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(info.started_at + (info.started_at.includes("Z") ? "" : "Z")).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap font-medium">
                      {formatDuration(info.started_at)}
                    </td>
                    <td className="text-right px-4 py-2.5">
                      <button
                        onClick={() => refetch()}
                        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                        title={t("admin.threads.refresh")}
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Footer count */}
        {!isLoading && !error && (
          <div className="text-center text-xs text-muted-foreground">
            {t("admin.threads.activeCount", { count })}
          </div>
        )}
      </div>
    </div>
  );
}
