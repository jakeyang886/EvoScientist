"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, AdminSuggestion, PaginatedResponse } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { Download, MessageSquareText, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const STATUSES = ["open", "reviewing", "resolved", "closed"] as const;

function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function statusClass(status: AdminSuggestion["status"]): string {
  switch (status) {
    case "reviewing": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "resolved": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "closed": return "bg-muted text-muted-foreground";
    default: return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
}

export default function AdminSuggestionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = {
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
    page,
    size: PAGE_SIZE,
  };

  const { data, isLoading, isError, isFetching, refetch } = useQuery<PaginatedResponse<AdminSuggestion>>({
    queryKey: ["admin-suggestions", queryParams],
    queryFn: () => adminApi.suggestions(queryParams),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: AdminSuggestion["status"] }) =>
      adminApi.updateSuggestionStatus(id, nextStatus),
    onSuccess: () => {
      toast.success(t("admin.suggestions.statusSaved"));
      queryClient.invalidateQueries({ queryKey: ["admin-suggestions"] });
    },
    onError: () => toast.error(t("admin.suggestions.statusFailed")),
  });

  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;
  const suggestions = data?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
            <MessageSquareText className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("admin.suggestions.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("admin.suggestions.total", { count: total })}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg p-2 transition-colors hover:bg-accent/50 disabled:opacity-50"
          title={t("admin.suggestions.refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("admin.suggestions.search")}
            className="w-full rounded-lg border bg-card py-2 pl-9 pr-9 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t("admin.suggestions.allStatus")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`admin.suggestions.status.${s}`)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("admin.suggestions.loading")}</div>
      ) : isError ? (
        <div className="py-12 text-center">
          <p className="mb-3 text-sm text-red-500">{t("admin.suggestions.loadFailed")}</p>
          <button onClick={() => refetch()} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent/50">
            {t("common.retry")}
          </button>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("admin.suggestions.noData")}</div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                      {t(`admin.suggestions.status.${item.status}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.user.username} · {item.user.email} · {formatDate(item.created_at)}
                  </p>
                </div>
                <select
                  value={item.status}
                  onChange={(e) => updateStatusMut.mutate({ id: item.id, nextStatus: e.target.value as AdminSuggestion["status"] })}
                  className="rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`admin.suggestions.status.${s}`)}</option>
                  ))}
                </select>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.content}</p>

              {item.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => adminApi.downloadSuggestionAttachment(file.id, file.filename)}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent/50"
                      title={file.filename}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{file.filename}</span>
                      <span className="shrink-0 text-muted-foreground">{Math.ceil(file.size / 1024)} KB</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.suggestions.prev")}
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.suggestions.next")}
          </button>
        </div>
      )}
    </div>
  );
}
