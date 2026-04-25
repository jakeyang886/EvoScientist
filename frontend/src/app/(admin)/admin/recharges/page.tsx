"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Wallet,
  Coins,
  CalendarClock,
  Activity,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────

const PAGE_SIZE = 20;

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseBalanceField(json: string | null, type: string): string {
  if (!json) return "-";
  try {
    const obj = JSON.parse(json);
    if (type === "tokens") return formatNumber(obj.token_balance);
    if (type === "days") return obj.plan_expires_at ? formatDate(obj.plan_expires_at) : "-";
    return JSON.stringify(obj);
  } catch {
    return json;
  }
}

// ─── Component ──────────────────────────────────────────────────

export default function AdminRechargesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = {
    ...(search ? { q: search } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    page,
    size: PAGE_SIZE,
  };

  const summaryParams = {
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["admin-recharge-summary", summaryParams],
    queryFn: () => adminApi.rechargeSummary(summaryParams),
    staleTime: 30_000,
  });

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-recharges", queryParams],
    queryFn: () => adminApi.recharges(queryParams),
  });

  const items = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  const summaryCards = [
    {
      label: t("admin.recharges.totalCount"),
      value: summary?.total_count ?? 0,
      icon: Wallet,
      color: "from-violet-500 to-indigo-500",
      format: false,
    },
    {
      label: t("admin.recharges.totalTokens"),
      value: summary?.total_tokens ?? 0,
      icon: Coins,
      color: "from-amber-500 to-orange-500",
      format: true,
    },
    {
      label: t("admin.recharges.totalDays"),
      value: summary?.total_days ?? 0,
      icon: CalendarClock,
      color: "from-blue-500 to-cyan-500",
      format: false,
    },
    {
      label: t("admin.recharges.todayCount"),
      value: summary?.today_count ?? 0,
      icon: Activity,
      color: "from-emerald-500 to-teal-500",
      format: false,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <Wallet className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("admin.recharges.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("admin.recharges.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
            title={t("admin.recharges.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("admin.recharges.search")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("admin.recharges.allTypes")}</option>
            <option value="tokens">{t("admin.recharges.typeTokens")}</option>
            <option value="days">{t("admin.recharges.typeDays")}</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("admin.recharges.dateFrom")}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("admin.recharges.dateTo")}
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              {t("admin.recharges.loading")}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              {t("admin.recharges.loadFailed")}{" "}
              <button onClick={() => refetch()} className="underline hover:no-underline">
                {t("admin.recharges.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("admin.recharges.noData")}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.user")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.type")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.amount")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.before")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.after")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.remark")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.operator")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.recharges.time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r: any) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{r.username || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${
                            r.type === "tokens"
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          }`}>
                            {r.type === "tokens" ? t("admin.recharges.typeTokens"): "***"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {r.type === "tokens" ? formatNumber(r.amount) : `${r.amount} ${t("admin.recharges.typeDays")}`}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                          {parseBalanceField(r.balance_before, r.type)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {parseBalanceField(r.balance_after, r.type)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate" title={r.remark || undefined}>
                          {r.remark || "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.operator_name || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} / {t("admin.recharges.totalRecords", { count: total })}
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
