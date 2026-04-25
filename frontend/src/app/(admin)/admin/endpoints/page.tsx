"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Server,
  RefreshCw,
  RotateCcw,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  TrendingUp,
  BarChart3,
  Activity,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function timeAgo(ts: number): string {
  if (!ts) return "-";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const COLORS = [
  { bg: "from-violet-500 to-indigo-500", line: "#8b5cf6" },
  { bg: "from-emerald-500 to-teal-500", line: "#10b981" },
  { bg: "from-amber-500 to-orange-500", line: "#f59e0b" },
  { bg: "from-blue-500 to-cyan-500", line: "#3b82f6" },
  { bg: "from-rose-500 to-pink-500", line: "#f43f5e" },
  { bg: "from-lime-500 to-green-500", line: "#84cc16" },
];

type GroupBy = "day" | "endpoint" | "model";

// ─── Mini bar chart (pure CSS) ────────────────────────────────

function MiniBarChart({ data, dates, color }: {
  data: Array<{ date: string; calls: number; input_tokens: number; output_tokens: number }>;
  dates: string[];
  color: string;
}) {
  if (!dates.length) return null;
  const maxCalls = Math.max(...data.map((d) => d.calls), 1);
  // Build a map for quick lookup
  const map = new Map(data.map((d) => [d.date, d]));
  return (
    <div className="flex items-end gap-px h-16 mt-1">
      {dates.map((dt) => {
        const d = map.get(dt);
        const h = d ? Math.max((d.calls / maxCalls) * 100, 2) : 0;
        return (
          <div
            key={dt}
            className="flex-1 rounded-t-sm transition-all duration-300"
            style={{ height: `${h}%`, backgroundColor: color, opacity: d ? 0.85 : 0.15 }}
            title={d ? `${dt}: ${d.calls} calls, ${fmtNum(d.input_tokens)} in / ${fmtNum(d.output_tokens)} out` : dt}
          />
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function AdminEndpointsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Date range state
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ── Auto-refresh (10s interval) ──
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-endpoint-stats"] });
    }, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, queryClient]);

  // ── Real-time stats ──
  const { data: rtData, isLoading: rtLoading, refetch: rtRefetch, isFetching: rtFetching } = useQuery({
    queryKey: ["admin-endpoint-stats"],
    queryFn: () => adminApi.endpointStats(),
    staleTime: 10_000,
  });

  // ── Today's history (fallback when realtime data is empty after restart) ──
  const { data: todayHist } = useQuery({
    queryKey: ["admin-endpoint-today", today],
    queryFn: () => adminApi.endpointHistory({ start_date: today, end_date: today, group_by: "endpoint" }),
    staleTime: 30_000,
    enabled: !rtData?.endpoints?.length,  // Only fetch when realtime is empty
  });

  // ── Historical stats ──
  const { data: histData, isLoading: histLoading, refetch: histRefetch, isFetching: histFetching } = useQuery({
    queryKey: ["admin-endpoint-history", startDate, endDate, groupBy],
    queryFn: () => adminApi.endpointHistory({ start_date: startDate, end_date: endDate, group_by: groupBy }),
    staleTime: 30_000,
  });

  const resetMutation = useMutation({
    mutationFn: () => adminApi.resetEndpointStats(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-endpoint-stats"] }),
  });

  // Merge realtime data with today's history fallback
  const effectiveEndpoints = useMemo(() => {
    if (rtData?.endpoints?.length) return rtData.endpoints;
    // Fallback: convert history data to realtime-like format
    if (todayHist?.endpoints?.length) {
      const totalCalls = todayHist.endpoints.reduce((s, e) => s + (e.calls || 0), 0);
      return todayHist.endpoints.map((ep) => ({
        ...ep,
        pct: totalCalls ? Math.round((ep.calls / totalCalls) * 1000) / 10 : 0,
        bar: "█".repeat(Math.round((ep.calls / totalCalls) * 20)) + "░".repeat(20 - Math.round((ep.calls / totalCalls) * 20)),
        models: (ep.models as string[])?.reduce<Record<string, number>>((acc, m) => { acc[m] = 1; return acc; }, {}) || {},
        last_call_ts: 0,
      }));
    }
    return [];
  }, [rtData, todayHist]);

  const effectiveSummary = useMemo(() => {
    if (rtData?.summary?.total_calls) return rtData.summary;
    if (todayHist?.summary) return todayHist.summary;
    return rtData?.summary ?? { total_calls: 0, total_input_tokens: 0, total_output_tokens: 0 };
  }, [rtData, todayHist]);

  const summary = effectiveSummary;
  const endpoints = effectiveEndpoints;
  const isFromHistory = !rtData?.endpoints?.length && !!todayHist?.endpoints?.length;

  const summaryCards = [
    { label: t("admin.endpoints.totalCalls", "Total Calls"), value: summary?.total_calls ?? 0, icon: Server, color: "from-violet-500 to-indigo-500", fmt: false },
    { label: t("admin.endpoints.inputTokens", "Input Tokens"), value: summary?.total_input_tokens ?? 0, icon: ArrowDownToLine, color: "from-emerald-500 to-teal-500", fmt: true },
    { label: t("admin.endpoints.outputTokens", "Output Tokens"), value: summary?.total_output_tokens ?? 0, icon: ArrowUpFromLine, color: "from-amber-500 to-orange-500", fmt: true },
  ];

  const groupByOptions: { value: GroupBy; label: string; icon: typeof Calendar }[] = [
    { value: "day", label: t("admin.endpoints.byDay", "By Day"), icon: Calendar },
    { value: "endpoint", label: t("admin.endpoints.byEndpoint", "By Endpoint"), icon: Server },
    { value: "model", label: t("admin.endpoints.byModel", "By Model"), icon: Zap },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <Server className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("admin.endpoints.title", "Endpoint Statistics")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isFromHistory
                  ? t("admin.endpoints.subtitleRestored", "Data restored from today's DB (service recently restarted)")
                  : t("admin.endpoints.subtitle", "Real-time endpoint call distribution and token usage")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                autoRefresh
                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              title={autoRefresh ? "Auto-refresh ON (10s)" : "Auto-refresh OFF"}
            >
              <Activity className={`w-3.5 h-3.5 ${autoRefresh ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{autoRefresh ? "Live" : "Paused"}</span>
            </button>
            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50"
              title={t("admin.endpoints.reset", "Reset statistics")}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetMutation.isPending ? "animate-spin" : ""}`} />
              <span>{t("admin.endpoints.reset", "Reset")}</span>
            </button>
            <button
              onClick={() => { rtRefetch(); histRefetch(); }}
              disabled={rtFetching || histFetching}
              className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
              title={t("admin.endpoints.refresh", "Refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${rtFetching || histFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {rtLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            {t("admin.endpoints.loading", "Loading...")}
          </div>
        ) : (
          <>
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
                    {card.fmt ? fmtNum(card.value) : card.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Real-time endpoint breakdown */}
            {endpoints.length > 0 && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="text-sm font-medium">
                    {t("admin.endpoints.breakdown", "Endpoint Breakdown")}
                  </h2>
                </div>
                <div className="p-4 space-y-5">
                  {endpoints.map((ep, idx) => {
                    const color = COLORS[idx % COLORS.length];
                    const modelEntries = Object.entries(ep.models);
                    return (
                      <div key={`${ep.provider}/${ep.endpoint}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md bg-gradient-to-r ${color.bg} text-white`}>
                              {ep.endpoint || "default"}
                            </span>
                            <span className="text-xs text-muted-foreground">{ep.provider}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                            <span>↓ {fmtNum(ep.input_tokens)}</span>
                            <span>↑ {fmtNum(ep.output_tokens)}</span>
                            <span>{ep.calls} calls ({ep.pct}%)</span>
                            <span>{timeAgo(ep.last_call_ts)}</span>
                          </div>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${color.bg} transition-all duration-500`}
                            style={{ width: `${ep.pct}%` }}
                          />
                        </div>
                        {modelEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {modelEntries.map(([model, count]) => (
                              <span key={model} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-muted text-muted-foreground">
                                <Zap className="w-2.5 h-2.5" />
                                {model} <span className="font-medium text-foreground">{count}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── Historical Section ─── */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t("admin.endpoints.history", "Historical Usage")}
            </h2>
            <div className="flex items-center gap-3">
              {/* Date range */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 rounded border bg-background text-foreground text-xs"
                />
                <span className="text-muted-foreground">~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 rounded border bg-background text-foreground text-xs"
                />
              </div>
              {/* Group by tabs */}
              <div className="flex rounded-lg border bg-muted/50 p-0.5">
                {groupByOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGroupBy(opt.value)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                      groupBy === opt.value
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <opt.icon className="w-3 h-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4">
            {histLoading ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                {t("admin.endpoints.loadingHistory", "Loading historical data...")}
              </div>
            ) : histData ? (
              <>
                {/* Summary line */}
                {histData.summary && (
                  <div className="flex items-center gap-6 text-xs text-muted-foreground mb-4">
                    <span>{histData.summary.total_calls.toLocaleString()} calls</span>
                    <span>↓ {fmtNum(histData.summary.total_input_tokens)}</span>
                    <span>↑ {fmtNum(histData.summary.total_output_tokens)}</span>
                    <span>{histData.start_date} ~ {histData.end_date}</span>
                  </div>
                )}

                {/* By Day — time series chart */}
                {groupBy === "day" && histData.dates && histData.endpoints && (
                  <div className="space-y-4">
                    {/* Date axis labels */}
                    {histData.dates.length > 0 && (
                      <div className="flex gap-px text-[9px] text-muted-foreground/60 h-4">
                        {histData.dates.filter((_, i) => i % Math.max(1, Math.floor(histData.dates!.length / 10)) === 0).map((dt) => (
                          <div key={dt} className="flex-1 text-center">{dt.slice(5)}</div>
                        ))}
                      </div>
                    )}
                    {histData.endpoints.map((ep, idx) => {
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div key={`${ep.provider}/${ep.endpoint}`} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color.line }} />
                              <span className="font-medium">{ep.endpoint || "default"}</span>
                              <span className="text-muted-foreground">{ep.provider}</span>
                            </div>
                            <div className="text-muted-foreground tabular-nums">
                              {ep.total_calls?.toLocaleString()} calls · ↓{fmtNum(ep.total_input || 0)} ↑{fmtNum(ep.total_output || 0)}
                            </div>
                          </div>
                          <MiniBarChart data={ep.days || []} dates={histData.dates || []} color={color.line} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* By Endpoint — table */}
                {groupBy === "endpoint" && histData.endpoints && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4">Endpoint</th>
                          <th className="text-left py-2 pr-4">Provider</th>
                          <th className="text-right py-2 pr-4">Calls</th>
                          <th className="text-right py-2 pr-4">%</th>
                          <th className="text-right py-2 pr-4">Input</th>
                          <th className="text-right py-2 pr-4">Output</th>
                          <th className="text-left py-2">Models</th>
                        </tr>
                      </thead>
                      <tbody>
                        {histData.endpoints.map((ep, idx) => (
                          <tr key={`${ep.provider}/${ep.endpoint}`} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium text-white bg-gradient-to-r ${COLORS[idx % COLORS.length].bg}`}>
                                {ep.endpoint || "default"}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">{ep.provider}</td>
                            <td className="py-2 pr-4 text-right tabular-nums font-medium">{ep.calls.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{ep.pct}%</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{fmtNum(ep.input_tokens)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-amber-600">{fmtNum(ep.output_tokens)}</td>
                            <td className="py-2 text-muted-foreground">{(ep.models as string[])?.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* By Model — table */}
                {groupBy === "model" && histData.models && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4">Model</th>
                          <th className="text-left py-2 pr-4">Endpoint</th>
                          <th className="text-left py-2 pr-4">Provider</th>
                          <th className="text-right py-2 pr-4">Calls</th>
                          <th className="text-right py-2 pr-4">%</th>
                          <th className="text-right py-2 pr-4">Input</th>
                          <th className="text-right py-2">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {histData.models.map((m, idx) => (
                          <tr key={`${m.model}/${m.endpoint}`} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{m.model}</td>
                            <td className="py-2 pr-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium text-white bg-gradient-to-r ${COLORS[idx % COLORS.length].bg}`}>
                                {m.endpoint || "default"}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">{m.provider}</td>
                            <td className="py-2 pr-4 text-right tabular-nums font-medium">{m.calls.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{m.pct}%</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{fmtNum(m.input_tokens)}</td>
                            <td className="py-2 text-right tabular-nums text-amber-600">{fmtNum(m.output_tokens)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Empty state */}
                {groupBy === "day" && (!histData.endpoints || histData.endpoints.length === 0) && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("admin.endpoints.noHistory", "No historical data for this period. Data accumulates as API calls are made.")}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
