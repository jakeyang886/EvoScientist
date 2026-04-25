"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Users,
  Activity,
  Zap,
  BarChart3,
  RefreshCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  max: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ultra: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

// ─── Component ────────────────────────────────────────────────

export default function AdminStatsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    staleTime: 30_000,
  });

  const statsCards = [
    {
      label: t("admin.stats.totalUsers"),
      value: data?.total_users ?? 0,
      icon: Users,
      color: "from-violet-500 to-indigo-500",
    },
    {
      label: t("admin.stats.activeToday"),
      value: data?.active_users_today ?? 0,
      icon: Activity,
      color: "from-emerald-500 to-teal-500",
    },
    {
      label: t("admin.stats.tokensToday"),
      value: data?.total_tokens_consumed_today ?? 0,
      icon: Zap,
      color: "from-amber-500 to-orange-500",
      format: true,
    },
    {
      label: t("admin.stats.runningThreads"),
      value: data?.active_threads ?? 0,
      icon: BarChart3,
      color: "from-blue-500 to-cyan-500",
    },
  ];

  const planEntries = Object.entries(data?.users_by_plan ?? {});

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <BarChart3 className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("admin.stats.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("admin.stats.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
            title={t("admin.stats.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Stats Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            {t("admin.stats.loading")}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            {t("admin.stats.loadFailed")}{" "}
            <button onClick={() => refetch()} className="underline hover:no-underline">
              {t("admin.stats.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statsCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{card.label}</span>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${card.color}`}>
                      <card.icon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {card.format ? formatNumber(card.value) : card.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Plan Distribution */}
            {planEntries.length > 0 && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="text-sm font-medium">{t("admin.stats.planDistribution")}</h2>
                </div>
                <div className="p-4 space-y-3">
                  {planEntries.map(([plan, count]) => {
                    const total = data?.total_users ?? 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={plan} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${PLAN_COLORS[plan] || "bg-muted text-muted-foreground"}`}>
                              {plan.charAt(0).toUpperCase() + plan.slice(1)}
                            </span>
                          </div>
                          <span className="text-muted-foreground tabular-nums">
                            {count} {t("admin.stats.users")} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
