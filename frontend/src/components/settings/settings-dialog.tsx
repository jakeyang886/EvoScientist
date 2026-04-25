"use client";

import { useTranslation } from "react-i18next";
import { useTheme } from "@/providers/theme-provider";
import { useAuth } from "@/providers/auth-provider";
import i18n from "@/i18n";
import { Sun, Moon, Monitor, Globe, Palette, User, Shield, Crown, Zap, Gift, Star } from "lucide-react";

const PLAN_META: Record<string, { label: string; icon: typeof Crown; color: string; bg: string }> = {
  starter: {
    label: "入门版",
    icon: Gift,
    color: "text-zinc-600 dark:text-zinc-400",
    bg: "bg-zinc-100 dark:bg-zinc-800",
  },
  pro: {
    label: "专业版",
    icon: Star,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
  },
  max: {
    label: "旗舰版",
    icon: Zap,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  ultra: {
    label: "企业版",
    icon: Crown,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
};

export function SettingsDialog() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const themes = [
    { value: "light", label: t("settings.light"), icon: Sun },
    { value: "dark", label: t("settings.dark"), icon: Moon },
    { value: "system", label: t("settings.system"), icon: Monitor },
  ];
  const languages = [
    { value: "zh-CN", label: "简体中文" },
    { value: "en-US", label: "English" },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
            <p className="text-sm text-muted-foreground">管理您的偏好和账户</p>
          </div>
        </div>

        {/* Language */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("settings.language")}</h2>
          </div>
          <div className="flex gap-2">
            {languages.map((l) => (
              <button
                key={l.value}
                onClick={() => {
                  i18n.changeLanguage(l.value);
                  localStorage.setItem("language", l.value);
                }}
                className={`flex-1 py-2.5 px-3 text-sm rounded-lg border transition-all ${
                  i18n.language === l.value
                    ? "bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-300"
                    : "hover:bg-accent/50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        {/* Theme */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("settings.theme")}</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {themes.map((th) => (
              <button
                key={th.value}
                onClick={() => setTheme(th.value as any)}
                className={`flex flex-col items-center gap-2 py-3 px-3 text-sm rounded-lg border transition-all ${
                  theme === th.value
                    ? "bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-300"
                    : "hover:bg-accent/50"
                }`}
              >
                <th.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{th.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Account section */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("settings.account")}</h2>
          </div>

          {/* User profile card */}
          {user && (
            <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-accent/20">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-white">
                  {user.username?.charAt(0).toUpperCase() || "?"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.username}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              {(() => {
                const plan = user.plan || "starter";
                const meta = PLAN_META[plan] || PLAN_META.starter;
                const Icon = meta.icon;
                return (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color} ${meta.bg}`}>
                    <Icon className="w-3.5 h-3.5" />
                    <span>{meta.label}</span>
                  </div>
                );
              })()}
            </div>
          )}

          <button
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span>{t("settings.changePassword")}</span>
            </div>
          </button>
        </section>
      </div>
    </div>
  );
}
