"use client";

import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { useTokenUsage, useTokenUsageThreads, useTokenUsageRecords, useTokenUsageHourly, useTokenUsage7dHourly } from "@/hooks/use-threads";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, TrendingUp, Zap, Calendar, MessageSquare, BarChart3,
  ChevronLeft, ChevronRight, List, Clock,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, BarChart, Bar,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type RangeKey = "1d" | "7d" | "30d";
const RANGE_OPTIONS: { key: RangeKey; days: number; label: string }[] = [
  { key: "1d", days: 1, label: "1d" },
  { key: "7d", days: 7, label: "7d" },
  { key: "30d", days: 30, label: "30d" },
];

type TabId = "trend" | "hourly" | "7d" | "monthly" | "threads" | "records";

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr + (isoStr.includes("Z") ? "" : "Z"));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 20;

// ─── Custom Tooltip ───────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.dataKey === "input_tokens" ? "Input" : entry.dataKey === "output_tokens" ? "Output" : "Total"}</span>
          <span className="font-mono font-medium">{formatNumber(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────

export function TokenStatsPanel({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("30d");
  const [activeTab, setActiveTab] = useState<TabId>("trend");
  const [recordsPage, setRecordsPage] = useState<number>(0);
  const [hourlyDate, setHourlyDate] = useState<string>(todayISO());

  const handleBack = onBack ?? (() => router.push("/chat"));

  // Always fetch 30 days to have full data
  const { data, isLoading, error } = useTokenUsage(30);
  const { data: threadsData, isLoading: threadsLoading } = useTokenUsageThreads(50);
  const { data: recordsData, isLoading: recordsLoading } = useTokenUsageRecords(
    PAGE_SIZE, recordsPage * PAGE_SIZE
  );
  const { data: hourlyData, isLoading: hourlyLoading } = useTokenUsageHourly(hourlyDate);
  const { data: data7d, isLoading: loading7d } = useTokenUsage7dHourly();

  const rangeDays = RANGE_OPTIONS.find(r => r.key === range)?.days ?? 30;

  const daily = data?.daily || [];
  const monthly = data?.monthly || [];
  const total = data?.total || { input_tokens: 0, output_tokens: 0, total_tokens: 0, message_count: 0 };
  const today = data?.today || { input_tokens: 0, output_tokens: 0, total_tokens: 0, message_count: 0 };
  const threads = threadsData?.threads || [];

  // All hooks MUST be called before any early returns (Rules of Hooks)
  const chartData = useMemo(() => {
    const sliced = [...daily].reverse().slice(-rangeDays);
    return sliced.map(d => ({
      ...d,
      label: formatDate(d.date),
    }));
  }, [daily, rangeDays]);

  const cumulativeData = useMemo(() => {
    let cumInput = 0;
    let cumOutput = 0;
    let cumTotal = 0;
    return chartData.map(d => {
      cumInput += d.input_tokens;
      cumOutput += d.output_tokens;
      cumTotal += d.total_tokens;
      return {
        ...d,
        cum_input: cumInput,
        cum_output: cumOutput,
        cum_total: cumTotal,
      };
    });
  }, [chartData]);

  const periodSummary = useMemo(() => {
    return chartData.reduce(
      (acc, d) => ({
        input_tokens: acc.input_tokens + d.input_tokens,
        output_tokens: acc.output_tokens + d.output_tokens,
        total_tokens: acc.total_tokens + d.total_tokens,
        message_count: acc.message_count + (d.message_count || 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0, message_count: 0 }
    );
  }, [chartData]);

  const monthlyChartData = useMemo(() => {
    return [...monthly].reverse().map(d => ({
      ...d,
      label: d.month.slice(5),
    }));
  }, [monthly]);

  // Hourly chart data
  const hourlyChartData = useMemo(() => {
    if (!hourlyData?.hourly) return [];
    return hourlyData.hourly.map(h => ({
      ...h,
      label: `${String(h.hour).padStart(2, "0")}:00`,
    }));
  }, [hourlyData]);

  // 7-day daily summary (for bar chart)
  const chartData7d = useMemo(() => {
    if (!data7d?.days) return [];
    return data7d.days.map(day => {
      const dayTotal = day.hourly.reduce((acc, h) => ({
        input_tokens: acc.input_tokens + h.input_tokens,
        output_tokens: acc.output_tokens + h.output_tokens,
        total_tokens: acc.total_tokens + h.total_tokens,
        message_count: acc.message_count + h.message_count,
      }), { input_tokens: 0, output_tokens: 0, total_tokens: 0, message_count: 0 });
      return {
        ...dayTotal,
        date: day.date,
        label: formatDate(day.date),
      };
    });
  }, [data7d]);

  // 7-day hourly overlay data (24h x 7 days for stacked area)
  const chartData7dHourly = useMemo(() => {
    if (!data7d?.days) return [];
    // Build 24 data points, each with day1_total, day2_total, etc.
    return Array.from({ length: 24 }, (_, h) => {
      const point: Record<string, number | string> = { label: `${String(h).padStart(2, "0")}:00` };
      data7d.days.forEach((day, i) => {
        const hourData = day.hourly.find(hr => hr.hour === h);
        point[`day${i}_total`] = hourData?.total_tokens ?? 0;
      });
      return point;
    });
  }, [data7d]);

  // ── Loading ──
  if (isLoading || threadsLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <PanelHeader onBack={handleBack} t={t} />
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <PanelHeader onBack={handleBack} t={t} />
          <div className="rounded-xl border bg-card p-4 text-center text-sm text-destructive">
            {t("common.error")}
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "trend", label: t("tokenStats.trendChart"), icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "hourly", label: t("tokenStats.hourlyChart"), icon: <Clock className="w-3.5 h-3.5" /> },
    { id: "7d", label: t("tokenStats.7dChart"), icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "monthly", label: t("tokenStats.monthlyChart"), icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: "threads", label: t("tokenStats.perConversation"), icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "records", label: t("tokenStats.detailRecords"), icon: <List className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <PanelHeader onBack={handleBack} t={t} />

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4" />}
            label={t("tokenStats.total")}
            value={formatNumber(total.total_tokens)}
            detail={`${formatNumber(total.input_tokens)} in / ${formatNumber(total.output_tokens)} out`}
            color="violet"
          />
          <SummaryCard
            icon={<Zap className="w-4 h-4" />}
            label={t("tokenStats.today")}
            value={formatNumber(today.total_tokens)}
            detail={`${formatNumber(today.input_tokens)} in / ${formatNumber(today.output_tokens)} out`}
            color="amber"
          />
          <SummaryCard
            icon={<MessageSquare className="w-4 h-4" />}
            label={t("tokenStats.count")}
            value={`${total.message_count ?? 0}`}
            detail={t("tokenStats.count")}
            color="blue"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded-md transition-all ${
                activeTab === tab.id
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Trend Tab ── */}
        {activeTab === "trend" && (
          <div className="space-y-6">
            {/* Range selector */}
            <section className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  {t("tokenStats.periodUsage")}
                </div>
                <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
                  {RANGE_OPTIONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                        range === r.key
                          ? "bg-background shadow-sm font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period summary row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{t("tokenStats.periodTotal")}</div>
                  <div className="text-lg font-bold text-violet-600 dark:text-violet-400">{formatNumber(periodSummary.total_tokens)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{t("tokenStats.input")}</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatNumber(periodSummary.input_tokens)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{t("tokenStats.output")}</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(periodSummary.output_tokens)}</div>
                </div>
              </div>

              {/* Daily area chart */}
              {chartData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        interval={range === "30d" ? 3 : range === "7d" ? 0 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => formatNumber(v)}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        iconType="plainline"
                        wrapperStyle={{ fontSize: 11 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_tokens"
                        name={t("tokenStats.totalTokens")}
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#gradTotal)"
                        dot={range !== "30d" ? { r: 3 } : false}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="input_tokens"
                        name={t("tokenStats.input")}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        fill="url(#gradInput)"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="output_tokens"
                        name={t("tokenStats.output")}
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="url(#gradOutput)"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  {t("tokenStats.noData")}
                </div>
              )}
            </section>

            {/* Cumulative area chart */}
            {chartData.length > 0 && (
              <section className="rounded-xl border bg-card p-4 space-y-3">
                <div className="text-sm font-medium text-muted-foreground">
                  {t("tokenStats.cumulativeChart")}
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulativeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradCumTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        interval={range === "30d" ? 3 : range === "7d" ? 0 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => formatNumber(v)}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="cum_total"
                        name={t("tokenStats.cumulativeTotal")}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#gradCumTotal)"
                        dot={range !== "30d" ? { r: 3 } : false}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Daily breakdown table */}
            {chartData.length > 0 && (
              <section className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.date")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...chartData].reverse().map((d) => (
                      <tr key={d.date} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2">{formatDate(d.date)}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.input_tokens)}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.output_tokens)}</td>
                        <td className="text-right px-4 py-2 font-medium">{formatNumber(d.total_tokens)}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{d.message_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {/* ── Hourly Tab ── */}
        {activeTab === "hourly" && (
          <div className="space-y-6">
            <section className="rounded-xl border bg-card p-4 space-y-4">
              {/* Date picker + navigation */}
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  {t("tokenStats.hourlyChart")}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHourlyDate(d => shiftDate(d, -1))}
                    className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={hourlyDate}
                    max={todayISO()}
                    onChange={(e) => setHourlyDate(e.target.value)}
                    className="px-2 py-1 text-xs rounded-md border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => setHourlyDate(d => {
                      const next = shiftDate(d, 1);
                      return next <= todayISO() ? next : d;
                    })}
                    disabled={hourlyDate >= todayISO()}
                    className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {hourlyDate !== todayISO() && (
                    <button
                      onClick={() => setHourlyDate(todayISO())}
                      className="px-2 py-1 text-xs rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      {t("tokenStats.today")}
                    </button>
                  )}
                </div>
              </div>

              {hourlyLoading ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : hourlyChartData.length > 0 ? (
                <>
                  {/* Hourly summary row */}
                  {hourlyData?.summary && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.total")}</div>
                        <div className="text-lg font-bold text-violet-600 dark:text-violet-400">
                          {formatNumber(hourlyData.summary.total_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.input")}</div>
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatNumber(hourlyData.summary.input_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.output")}</div>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(hourlyData.summary.output_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.count")}</div>
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                          {hourlyData.summary.message_count}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hourly area chart */}
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradHourlyTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradHourlyInput" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradHourlyOutput" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          interval={2}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => formatNumber(v)}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          type="monotone"
                          dataKey="total_tokens"
                          name={t("tokenStats.totalTokens")}
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fill="url(#gradHourlyTotal)"
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="input_tokens"
                          name={t("tokenStats.input")}
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          fill="url(#gradHourlyInput)"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="output_tokens"
                          name={t("tokenStats.output")}
                          stroke="#10b981"
                          strokeWidth={1.5}
                          fill="url(#gradHourlyOutput)"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  {t("tokenStats.noData")}
                </div>
              )}
            </section>

            {/* Hourly breakdown table */}
            {hourlyChartData.length > 0 && hourlyData?.summary && hourlyData.summary.total_tokens > 0 && (
              <section className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.hour")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlyChartData
                      .filter(h => h.total_tokens > 0 || h.message_count > 0)
                      .map((h) => (
                        <tr key={h.hour} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-medium">{h.label}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(h.input_tokens)}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(h.output_tokens)}</td>
                          <td className="text-right px-4 py-2 font-medium">{formatNumber(h.total_tokens)}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{h.message_count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {/* ── 7-Day Tab ── */}
        {activeTab === "7d" && (
          <div className="space-y-6">
            {loading7d ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : chartData7d.length > 0 ? (
              <>
                {/* 7-day summary */}
                {data7d?.summary_7d && (
                  <section className="rounded-xl border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">{t("tokenStats.7dChart")}</h3>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.total")}</div>
                        <div className="text-lg font-bold text-violet-600 dark:text-violet-400">
                          {formatNumber(data7d.summary_7d.total_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.input")}</div>
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatNumber(data7d.summary_7d.input_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.output")}</div>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(data7d.summary_7d.output_tokens)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground">{t("tokenStats.avgPerDay")}</div>
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                          {formatNumber(Math.round(data7d.summary_7d.total_tokens / 7))}
                        </div>
                      </div>
                    </div>

                    {/* Daily bar chart */}
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData7d} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) => formatNumber(v)}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                          <Bar
                            dataKey="input_tokens"
                            name={t("tokenStats.input")}
                            stackId="tokens"
                            fill="#3b82f6"
                            radius={[0, 0, 0, 0]}
                          />
                          <Bar
                            dataKey="output_tokens"
                            name={t("tokenStats.output")}
                            stackId="tokens"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* 7-day hourly overlay chart */}
                {chartData7dHourly.length > 0 && data7d?.days && data7d.days.length > 0 && (
                  <section className="rounded-xl border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">{t("tokenStats.7dHourlyOverlay")}</h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData7dHourly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            interval={2}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) => formatNumber(v)}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                          {data7d.days.map((day, i) => {
                            const opacity = 0.3 + (i / data7d.days.length) * 0.7;
                            const hue = 250 + i * 25;
                            return (
                              <Area
                                key={day.date}
                                type="monotone"
                                dataKey={`day${i}_total`}
                                name={formatDate(day.date)}
                                stroke={`hsl(${hue}, 70%, 55%)`}
                                fill="transparent"
                                strokeWidth={i === data7d.days.length - 1 ? 2.5 : 1.5}
                                strokeOpacity={opacity}
                                dot={false}
                                activeDot={{ r: 3 }}
                              />
                            );
                          })}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* Daily detail table */}
                <section className="rounded-xl border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.date")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.count")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...chartData7d].reverse().map((d) => (
                        <tr key={d.date} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-medium">{d.label}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.input_tokens)}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.output_tokens)}</td>
                          <td className="text-right px-4 py-2 font-medium">{formatNumber(d.total_tokens)}</td>
                          <td className="text-right px-4 py-2 text-muted-foreground">{d.message_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                {t("tokenStats.noData")}
              </div>
            )}
          </div>
        )}

        {/* ── Monthly Tab ── */}
        {activeTab === "monthly" && (
          <div className="space-y-6">
            {/* Monthly chart */}
            <section className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("tokenStats.monthlyChart")}</h3>
              {monthlyChartData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradMonthTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => formatNumber(v)}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                      <Area
                        type="monotone"
                        dataKey="total_tokens"
                        name={t("tokenStats.totalTokens")}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#gradMonthTotal)"
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="input_tokens"
                        name={t("tokenStats.input")}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        fill="transparent"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="output_tokens"
                        name={t("tokenStats.output")}
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="transparent"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  {t("tokenStats.noData")}
                </div>
              )}
            </section>

            {/* Monthly breakdown table */}
            {monthlyChartData.length > 0 && (
              <section className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.month")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthlyChartData].reverse().map((d) => (
                      <tr key={d.month} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium">{d.month}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.input_tokens)}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{formatNumber(d.output_tokens)}</td>
                        <td className="text-right px-4 py-2 font-medium">{formatNumber(d.total_tokens)}</td>
                        <td className="text-right px-4 py-2 text-muted-foreground">{d.message_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {/* ── Threads Tab ── */}
        {activeTab === "threads" && (
          <section className="rounded-xl border bg-card overflow-hidden">
            {threads.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.conversation")}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.count")}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.lastUsed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {threads.map((th) => (
                    <tr
                      key={th.thread_id}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => router.push(`/chat/${th.thread_id}`)}
                    >
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <div className="truncate font-medium" title={th.title}>
                          {th.title}
                        </div>
                        {th.model && (
                          <div className="text-[11px] text-muted-foreground truncate">{th.model}</div>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatNumber(th.input_tokens)}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatNumber(th.output_tokens)}
                      </td>
                      <td className="text-right px-4 py-2.5 font-medium whitespace-nowrap">
                        {formatNumber(th.total_tokens)}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {th.message_count ?? 0}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDate(th.last_used)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("tokenStats.noData")}
              </div>
            )}
          </section>
        )}

        {/* ── Records Tab ── */}
        {activeTab === "records" && (
          <div className="space-y-4">
            <section className="rounded-xl border bg-card overflow-hidden">
              {recordsLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : recordsData && recordsData.records.length > 0 ? (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.time")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.conversation")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.model")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.input")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.output")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("tokenStats.total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordsData.records.map((rec) => (
                        <tr
                          key={rec.id}
                          className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => rec.thread_id && router.push(`/chat/${rec.thread_id}`)}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                            {formatDateTime(rec.created_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="truncate max-w-[140px] font-medium" title={rec.title}>
                              {rec.title}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {rec.model || "-"}
                          </td>
                          <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatNumber(rec.input_tokens)}
                          </td>
                          <td className="text-right px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatNumber(rec.output_tokens)}
                          </td>
                          <td className="text-right px-4 py-2.5 font-medium whitespace-nowrap">
                            {formatNumber(rec.total_tokens)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  {recordsData.total > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        {recordsPage * PAGE_SIZE + 1}-{Math.min((recordsPage + 1) * PAGE_SIZE, recordsData.total)} / {recordsData.total}
                      </span>
                      <div className="flex gap-2">
                        <button
                          disabled={recordsPage === 0}
                          onClick={() => setRecordsPage((p) => Math.max(0, p - 1))}
                          className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          disabled={(recordsPage + 1) * PAGE_SIZE >= recordsData.total}
                          onClick={() => setRecordsPage((p) => p + 1)}
                          className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("tokenStats.noData")}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function PanelHeader({ onBack, t }: { onBack: () => void; t: (key: string) => string }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-2 rounded-lg hover:bg-accent/50 transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.tokenUsage")}</h1>
        <p className="text-sm text-muted-foreground">{t("tokenStats.subtitle")}</p>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  color: "violet" | "amber" | "blue",
}) {
  const gradients = {
    violet: "from-violet-600 to-indigo-600",
    amber: "from-amber-500 to-orange-500",
    blue: "from-blue-500 to-cyan-500",
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br ${gradients[color]}`}>
          <span className="text-white">{icon}</span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
