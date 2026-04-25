"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import type { AdminTokenStatsSummary } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Zap,
  Users,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatAxisNumber(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(0) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
}

type Period = "1d" | "7d" | "30d";

const PERIOD_DAYS: Record<Period, number> = { "1d": 1, "7d": 7, "30d": 30 };

// ─── Custom Tooltip ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-sm space-y-1.5">
      <p className="font-medium text-muted-foreground">{label}</p>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium tabular-nums">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  format,
  loading,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
  format?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${color}`}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {loading ? "..." : format ? formatNumber(value) : value.toLocaleString()}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────

export default function AdminTokenStatsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("7d");

  const days = PERIOD_DAYS[period];
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-token-stats", days],
    queryFn: () => adminApi.tokenStats(days),
    staleTime: 30_000,
  });

  const summary: AdminTokenStatsSummary | undefined = data?.summary?.[period];
  const daily = data?.daily ?? [];

  // Prepare chart data — hourly (24 points) for 1d, daily for 7d/30d
  const chartData = useMemo(() => {
    if (period === "1d" && data?.hourly?.length) {
      return data.hourly.map(h => ({
        ...h,
        label: `${String(h.hour).padStart(2, "0")}:00`,
      }));
    }
    return daily.map((d) => {
      const parts = d.date.split("-");
      const label = `${parts[1]}/${parts[2]}`;
      return { ...d, label };
    });
  }, [period, data, daily]) as Array<Record<string, any>>;

  const isHourlyView = period === "1d" && (data?.hourly?.length ?? 0) > 0;

  const avgPerDay =
    period === "1d"
      ? summary?.total_tokens ?? 0
      : summary
        ? Math.round(summary.total_tokens / days)
        : 0;

  const summaryCards = [
    {
      label: t("admin.tokenStats.totalTokens"),
      value: summary?.total_tokens ?? 0,
      icon: Zap,
      color: "from-amber-500 to-orange-500",
      format: true,
    },
    {
      label: t("admin.tokenStats.inputTokens"),
      value: summary?.input_tokens ?? 0,
      icon: ArrowDownToLine,
      color: "from-blue-500 to-cyan-500",
      format: true,
    },
    {
      label: t("admin.tokenStats.outputTokens"),
      value: summary?.output_tokens ?? 0,
      icon: ArrowUpFromLine,
      color: "from-emerald-500 to-teal-500",
      format: true,
    },
    {
      label: t("admin.tokenStats.messages"),
      value: summary?.message_count ?? 0,
      icon: MessageSquare,
      color: "from-violet-500 to-indigo-500",
      format: true,
    },
    {
      label: t("admin.tokenStats.activeUsers"),
      value: summary?.active_users ?? 0,
      icon: Users,
      color: "from-pink-500 to-rose-500",
      format: false,
    },
    {
      label: t("admin.tokenStats.avgPerDay"),
      value: avgPerDay,
      icon: TrendingUp,
      color: "from-cyan-500 to-blue-500",
      format: true,
    },
  ];

  const periodButtons: { key: Period; label: string }[] = [
    { key: "1d", label: t("admin.tokenStats.today") },
    { key: "7d", label: t("admin.tokenStats.last7d") },
    { key: "30d", label: t("admin.tokenStats.last30d") },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("admin.tokenStats.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("admin.tokenStats.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
            title={t("admin.tokenStats.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Period Selector */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
          {periodButtons.map((b) => (
            <button
              key={b.key}
              onClick={() => setPeriod(b.key)}
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                period === b.key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            {t("admin.tokenStats.loading")}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            {t("admin.tokenStats.loadFailed")}{" "}
            <button onClick={() => refetch()} className="underline hover:no-underline">
              {t("admin.tokenStats.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summaryCards.map((card) => (
                <SummaryCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  color={card.color}
                  format={card.format}
                />
              ))}
            </div>

            {/* Trend Chart */}
            {chartData.length > 0 ? (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="text-sm font-medium">
                    {isHourlyView
                      ? t("admin.tokenStats.hourlyChart", { defaultValue: "Hourly Usage (Today)" })
                      : t("admin.tokenStats.trendChart")}
                  </h2>
                </div>
                <div className="p-4">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      {isHourlyView ? (
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradHTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="gradHInput" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="gradHOutput" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            interval={1}
                          />
                          <YAxis
                            tickFormatter={formatAxisNumber}
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                          <Area
                            type="monotone"
                            dataKey="input_tokens"
                            name={t("admin.tokenStats.input")}
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#gradHInput)"
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="output_tokens"
                            name={t("admin.tokenStats.output")}
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#gradHOutput)"
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="total_tokens"
                            name={t("admin.tokenStats.total")}
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#gradHTotal)"
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </AreaChart>
                      ) : (
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={formatAxisNumber}
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend
                            iconType="plainline"
                            wrapperStyle={{ fontSize: 11 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="input_tokens"
                            name={t("admin.tokenStats.input")}
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#gradInput)"
                            dot={chartData.length <= 14 ? { r: 3 } : false}
                            activeDot={{ r: 5 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="output_tokens"
                            name={t("admin.tokenStats.output")}
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#gradOutput)"
                            dot={chartData.length <= 14 ? { r: 3 } : false}
                            activeDot={{ r: 5 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="total_tokens"
                            name={t("admin.tokenStats.total")}
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#gradTotal)"
                            dot={chartData.length <= 14 ? { r: 3 } : false}
                            activeDot={{ r: 5 }}
                          />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {t("admin.tokenStats.noData")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
