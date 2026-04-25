"use client";

import { useAuth } from "@/providers/auth-provider";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Settings, LogOut, ChevronUp, BarChart3 } from "lucide-react";
import { balanceApi, type UserBalance } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch balance info
  const { data: balance } = useQuery<UserBalance>({
    queryKey: ["balance"],
    queryFn: () => balanceApi.get(),
    staleTime: 30_000,
  });

  const planLabel = (balance?.plan ? balance.plan.charAt(0).toUpperCase() + balance.plan.slice(1) : null) || user?.plan || "Starter";

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const handleSettings = () => {
    setOpen(false);
    router.push("/settings");
  };

  const handleTokenStats = () => {
    setOpen(false);
    router.push("/token-stats");
  };

  const formatBalance = () => {
    if (!balance) return null;
    if (balance.plan === "starter") {
      const bal = balance.token_balance ?? 0;
      const color = bal < 0 ? "text-red-500" : bal < 10000 ? "text-yellow-500" : "text-muted-foreground";
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Balance</span>
          <span className={`text-xs font-medium ${color}`}>
            {bal < 0 ? `${bal.toLocaleString()}` : bal.toLocaleString()} tokens
          </span>
        </div>
      );
    }
    if (balance.plan_expires_at) {
      const date = new Date(balance.plan_expires_at).toLocaleDateString();
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Expires</span>
          <span className="text-xs font-medium text-muted-foreground">{date}</span>
        </div>
      );
    }
    return null;
  };

  // 首字母大写头像
  const initial = user?.username?.charAt(0).toUpperCase() || "?";

  if (collapsed) {
    // 折叠状态：只显示头像，点击显示菜单
    return (
      <div className="border-t p-2 relative" ref={ref} style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center mx-auto"
        >
          <span className="text-xs font-semibold text-white">{initial}</span>
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b">
              <div className="text-sm font-medium truncate">{user?.username || "用户"}</div>
            </div>
            <div className="p-1.5 space-y-0.5">
              <button
                onClick={handleTokenStats}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
              >
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{t("sidebar.tokenUsage")}</span>
              </button>
              <button
                onClick={handleSettings}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{t("sidebar.settings")}</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">{t("sidebar.logout")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t p-2 relative" ref={ref} style={{ borderColor: "hsl(var(--sidebar-border))" }}>
      {/* 用户信息栏 — 类似 ChatGPT：头像 + 用户名 + 箭头 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/60 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-white">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate text-left" style={{ color: "hsl(var(--sidebar-text))" }}>
              {user?.username || "用户"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium shrink-0">
              {planLabel}
            </span>
          </div>
          {formatBalance() && (
            <div className="mt-0.5">{formatBalance()}</div>
          )}
        </div>
        <ChevronUp className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-2 rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b">
            <div className="text-sm font-medium truncate">{user?.username || "用户"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <div className="p-1.5 space-y-0.5">
            <button
              onClick={handleTokenStats}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
            >
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{t("sidebar.tokenUsage")}</span>
            </button>
            <button
              onClick={handleSettings}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{t("sidebar.settings")}</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">{t("sidebar.logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
