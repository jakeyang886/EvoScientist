"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { Settings, Server, Shield, Database, ChevronDown, ChevronUp, Save, RotateCw, CheckCircle, AlertCircle, Globe } from "lucide-react";

// ─── Timezone options ───────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST, UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT, UTC+8)" },
  { value: "America/New_York", label: "America/New_York (EST, UTC-5)" },
  { value: "America/Chicago", label: "America/Chicago (CST, UTC-6)" },
  { value: "America/Denver", label: "America/Denver (MST, UTC-7)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST, UTC-8)" },
  { value: "Europe/London", label: "Europe/London (GMT, UTC+0)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET, UTC+1)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET, UTC+1)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (MSK, UTC+3)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST, UTC+10)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST, UTC+12)" },
];

// ─── Types ────────────────────────────────────────────────────

interface RateLimitsConfig {
  tokens_per_minute: number | null;
  tokens_per_day: number | null;
  requests_per_5h: number | null;
  requests_per_week: number | null;
}

interface PlanConfig {
  label: string;
  billing_mode: "pay_as_you_go" | "subscription";
  initial_tokens?: number | null;
  price_per_million?: number | null;
  monthly_fee?: number | null;
  default_days?: number | null;
  rate_limits: RateLimitsConfig;
  max_concurrent_threads: number;
}

interface PricingConfig {
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  token_pricing: {
    price_per_million_tokens: number;
    currency: string;
  };
  plans: Record<string, PlanConfig>;
}

const PLAN_ORDER = ["starter", "pro", "max", "ultra"] as const;

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  max: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ultra: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const PLAN_ICONS: Record<string, string> = {
  starter: "🆓",
  pro: "⭐",
  max: "👑",
  ultra: "💎",
};

// ─── Plan Editor ──────────────────────────────────────────────

function PlanEditor({
  planKey,
  config,
  onChange,
  expanded,
  onToggle,
  t,
}: {
  planKey: string;
  config: PlanConfig;
  onChange: (key: string, field: string, value: any) => void;
  expanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  const isStarter = config.billing_mode === "pay_as_you_go";
  const rl = config.rate_limits;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{PLAN_ICONS[planKey]}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{config.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${PLAN_COLORS[planKey]}`}>
              {planKey}
            </span>
            <span className="text-xs text-muted-foreground">
              {isStarter ? t("admin.settings.billingPayAsYouGo") : t("admin.settings.billingSubscription")}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          {/* Label */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.planName")}</label>
            <input
              type="text"
              value={config.label}
              onChange={(e) => onChange(planKey, "label", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
            />
          </div>

          {/* Starter fields */}
          {isStarter && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.initialTokens")}</label>
                <input
                  type="number"
                  value={config.initial_tokens ?? ""}
                  onChange={(e) => onChange(planKey, "initial_tokens", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.pricePerMillion")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.price_per_million ?? ""}
                  onChange={(e) => onChange(planKey, "price_per_million", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Subscription fields */}
          {!isStarter && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.monthlyFee")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.monthly_fee ?? ""}
                  onChange={(e) => onChange(planKey, "monthly_fee", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.defaultDays")}</label>
                <input
                  type="number"
                  value={config.default_days ?? ""}
                  onChange={(e) => onChange(planKey, "default_days", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Rate Limits */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("admin.settings.rateLimits")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground/70 mb-1 block">{t("admin.settings.tokensPerMinute")}</label>
                <input
                  type="number"
                  placeholder={t("admin.settings.unlimited")}
                  value={rl.tokens_per_minute ?? ""}
                  onChange={(e) => onChange(planKey, "rate_limits.tokens_per_minute", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground/70 mb-1 block">{t("admin.settings.tokensPerDay")}</label>
                <input
                  type="number"
                  placeholder={t("admin.settings.unlimited")}
                  value={rl.tokens_per_day ?? ""}
                  onChange={(e) => onChange(planKey, "rate_limits.tokens_per_day", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground/70 mb-1 block">{t("admin.settings.requestsPer5h")}</label>
                <input
                  type="number"
                  placeholder={t("admin.settings.unlimited")}
                  value={rl.requests_per_5h ?? ""}
                  onChange={(e) => onChange(planKey, "rate_limits.requests_per_5h", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground/70 mb-1 block">{t("admin.settings.requestsPerWeek")}</label>
                <input
                  type="number"
                  placeholder={t("admin.settings.unlimited")}
                  value={rl.requests_per_week ?? ""}
                  onChange={(e) => onChange(planKey, "rate_limits.requests_per_week", e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Concurrent threads */}
          <div className="w-1/2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("admin.settings.maxConcurrent")}</label>
            <input
              type="number"
              value={config.max_concurrent_threads}
              onChange={(e) => onChange(planKey, "max_concurrent_threads", Number(e.target.value) || 1)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editData, setEditData] = useState<PricingConfig | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null);

  // Timezone query
  const { data: tzData } = useQuery({
    queryKey: ["admin-timezone"],
    queryFn: () => adminApi.getTimezone(),
    staleTime: 0,
  });

  // Sync timezone from server
  const currentTimezone = selectedTimezone ?? tzData?.timezone ?? "UTC";

  const saveTimezoneMutation = useMutation({
    mutationFn: (timezone: string) => adminApi.updateTimezone(timezone),
    onSuccess: () => {
      setToast({ type: "success", message: t("admin.settings.timezoneSaved") });
      queryClient.invalidateQueries({ queryKey: ["admin-timezone"] });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err: any) => {
      const msg = err?.message || t("admin.settings.saveFailed");
      setToast({ type: "error", message: msg });
      setTimeout(() => setToast(null), 5000);
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: () => adminApi.pricing() as Promise<PricingConfig>,
    staleTime: 0,
  });

  // Use fetched data or edited data
  const pricing = editData ?? data ?? null;

  const saveMutation = useMutation({
    mutationFn: (payload: PricingConfig) => adminApi.updatePricing(payload as any),
    onSuccess: () => {
      setToast({ type: "success", message: t("admin.settings.saved") });
      setEditData(null);
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err: any) => {
      const msg = err?.message || t("admin.settings.saveFailed");
      setToast({ type: "error", message: msg });
      setTimeout(() => setToast(null), 5000);
    },
  });

  const handleFieldChange = (planKey: string, field: string, value: any) => {
    if (!data) return;
    // Deep clone and apply change
    const newData: PricingConfig = JSON.parse(JSON.stringify(editData ?? data));
    if (field.startsWith("rate_limits.")) {
      const rlField = field.replace("rate_limits.", "");
      (newData.plans[planKey] as any).rate_limits[rlField] = value;
    } else {
      (newData.plans[planKey] as any)[field] = value;
    }
    setEditData(newData);
  };

  const handleTokenPricingChange = (field: string, value: any) => {
    if (!data) return;
    const newData: PricingConfig = JSON.parse(JSON.stringify(editData ?? data));
    (newData.token_pricing as any)[field] = value;
    setEditData(newData);
  };

  const handleSave = () => {
    if (!pricing) return;
    saveMutation.mutate(pricing);
  };

  const handleReset = () => {
    setEditData(null);
    refetch();
  };

  const togglePlan = (key: string) => {
    setExpandedPlans((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasChanges = editData !== null;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RotateCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t("admin.settings.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError || !pricing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-500">{t("admin.settings.loadFailed")}</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-violet-600 hover:underline"
          >
            {t("admin.settings.retry")}
          </button>
        </div>
      </div>
    );
  }

  const placeholderSections = [
    { icon: Server, title: t("admin.settings.serverConfig"), desc: t("admin.settings.serverConfigDesc") },
    { icon: Shield, title: t("admin.settings.securitySettings"), desc: t("admin.settings.securityDesc") },
    { icon: Database, title: t("admin.settings.dataManagement"), desc: t("admin.settings.dataDesc") },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("admin.settings.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("admin.settings.subtitle")}</p>
            </div>
          </div>
          {pricing.version > 0 && (
            <span className="text-xs text-muted-foreground">
              v{pricing.version}
              {pricing.updated_at && ` · ${new Date(pricing.updated_at).toLocaleString("zh-CN")}`}
            </span>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
              toast.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        )}

        {/* ── Pricing Card ── */}
        <div className="rounded-xl border bg-card">
          <div className="p-5 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium flex items-center gap-2">
                  💰 {t("admin.settings.pricingTitle")}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("admin.settings.pricingDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    {t("admin.settings.undoChanges")}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !hasChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveMutation.isPending ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {t("admin.settings.save")}
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Global token pricing */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("admin.settings.tokenPrice")}</h3>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  value={pricing.token_pricing.price_per_million_tokens}
                  onChange={(e) =>
                    handleTokenPricingChange("price_per_million_tokens", Number(e.target.value))
                  }
                  className="w-40 px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">
                  {t("admin.settings.tokenPriceUnit")} ({pricing.token_pricing.currency})
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Plan configs */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-3">{t("admin.settings.planConfig")}</h3>
              <div className="space-y-3">
                {PLAN_ORDER.map((planKey) => {
                  const planCfg = pricing.plans[planKey];
                  if (!planCfg) return null;
                  return (
                    <PlanEditor
                      key={planKey}
                      planKey={planKey}
                      config={planCfg}
                      onChange={handleFieldChange}
                      expanded={!!expandedPlans[planKey]}
                      onToggle={() => togglePlan(planKey)}
                      t={t}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Timezone Card ── */}
        <div className="rounded-xl border bg-card">
          <div className="p-5 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium flex items-center gap-2">
                  🌐 {t("admin.settings.timezoneTitle")}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("admin.settings.timezoneDesc")}
                </p>
              </div>
              <button
                onClick={() => saveTimezoneMutation.mutate(currentTimezone)}
                disabled={saveTimezoneMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveTimezoneMutation.isPending ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {t("admin.settings.save")}
              </button>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <select
                value={currentTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
                className="w-full max-w-md px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Placeholder sections ── */}
        <div className="space-y-4">
          {placeholderSections.map((section) => (
            <div
              key={section.title}
              className="rounded-xl border bg-card p-5 space-y-2 opacity-60"
            >
              <div className="flex items-center gap-2.5">
                <section.icon className="w-4.5 h-4.5 text-muted-foreground" />
                <h2 className="text-sm font-medium">{section.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground pl-7">{section.desc}</p>
              <div className="pl-7 pt-2">
                <span className="text-xs text-muted-foreground/60 bg-muted/50 px-2.5 py-1 rounded-md">
                  {t("admin.settings.comingSoon")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
