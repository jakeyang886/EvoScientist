"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  Zap,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────

const PAGE_SIZE = 20;

type DatePreset = "today" | "7d" | "30d" | "all";

// ─── Helpers ────────────────────────────────────────────────────

function formatNumber(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function planBadgeColor(plan: string): string {
  switch (plan) {
    case "pro": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "max": return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "ultra": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function getDateRange(preset: DatePreset): { date_from: string; date_to: string } | {} {
  const today = toISODate(new Date());
  switch (preset) {
    case "today":
      return { date_from: today, date_to: today };
    case "7d": {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { date_from: toISODate(d), date_to: today };
    }
    case "30d": {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { date_from: toISODate(d), date_to: today };
    }
    case "all":
      return {};
  }
}

// ─── Component ──────────────────────────────────────────────────

export default function AdminConsumptionPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [customMode, setCustomMode] = useState(false);

  function applyPreset(p: DatePreset) {
    setPreset(p);
    setCustomMode(false);
    setPage(1);
  }

  function applyCustom() {
    setPreset("all");
    setCustomMode(true);
    setPage(1);
  }

  const rangeParams = customMode
    ? { ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) }
    : getDateRange(preset);

  const queryParams = { ...rangeParams, page, size: PAGE_SIZE };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["admin-consumption-summary", rangeParams],
    queryFn: () => adminApi.consumptionSummary(rangeParams),
    staleTime: 30_000,
  });

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-consumption", queryParams],
    queryFn: () => adminApi.consumption(queryParams),
  });

  const items = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  const summaryCards = [
    {
      label: t("admin.consumption.totalTokens"),
      value: summary?.total_tokens ?? 0,
      icon: Zap,
      color: "from-amber-500 to-orange-500",
      format: true,
    },
    {
      label: t("admin.consumption.activeUsers"),
      value: summary?.active_users ?? 0,
      icon: Users,
      color: "from-emerald-500 to-teal-500",
      format: false,
    },
    {
      label: t("admin.consumption.avgPerUser"),
      value: summary?.avg_tokens_per_user ?? 0,
      icon: TrendingUp,
      color: "from-blue-500 to-cyan-500",
      format: true,
    },
  ];

  const presetButtons: { key: DatePreset; label: string }[] = [
    { key: "today", label: t("admin.consumption.today") },
    { key: "7d", label: t("admin.consumption.last7d") },
    { key: "30d", label: t("admin.consumption.last30d") },
    { key: "all", label: t("admin.consumption.all") },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("admin.consumption.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("admin.consumption.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
            title={t("admin.consumption.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${card.color}`}>
                  <card.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {summaryLoading ? "..." : card.format ? formatNumber(card.value) : card.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Date Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
            {presetButtons.map((b) => (
              <button
                key={b.key}
                onClick={() => applyPreset(b.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                  preset === b.key && !customMode
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); applyCustom(); }}
              className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-muted-foreground text-sm">{t("admin.consumption.to")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); applyCustom(); }}
              className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              {t("admin.consumption.loading")}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              {t("admin.consumption.loadFailed")}{" "}
              <button onClick={() => refetch()} className="underline hover:no-underline">
                {t("admin.consumption.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("admin.consumption.noData")}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.consumption.user")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.consumption.plan")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.consumption.tokenConsumed")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.consumption.messages")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.consumption.lastActive")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((u: any) => (
                      <tr key={u.uid} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/admin/users/${u.uid}`)}
                            className="font-medium text-violet-600 dark:text-violet-400 hover:underline"
                          >
                            {u.username}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md capitalize ${planBadgeColor(u.plan)}`}>
                            {u.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatNumber(u.total_tokens)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(u.total_messages)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(u.last_active)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} / {t("admin.consumption.totalUsers", { count: total })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
