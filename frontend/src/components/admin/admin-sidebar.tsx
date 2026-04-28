"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminAuth } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Users,
  BarChart3,
  LogOut,
  Shield,
  Settings,
  Bot,
  Activity,
  ChevronLeft,
  ChevronRight,
  Wallet,
  TrendingUp,
  Zap,
  Server,
  MessageSquareText,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", labelKey: "admin.nav.users", icon: Users },
  { href: "/admin/threads", labelKey: "admin.nav.threads", icon: Activity },
  { href: "/admin/recharges", labelKey: "admin.nav.recharges", icon: Wallet },
  { href: "/admin/consumption", labelKey: "admin.nav.consumption", icon: TrendingUp },
  { href: "/admin/token-stats", labelKey: "admin.nav.tokenStats", icon: Zap },
  { href: "/admin/endpoints", labelKey: "admin.nav.endpoints", icon: Server },
  { href: "/admin/suggestions", labelKey: "admin.nav.suggestions", icon: MessageSquareText },
  { href: "/admin/stats", labelKey: "admin.nav.stats", icon: BarChart3 },
  { href: "/admin/llm-settings", labelKey: "admin.nav.llmSettings", icon: Bot },
  { href: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings },
];

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  // Auth guard — redirect to admin-login if no admin token
  useEffect(() => {
    if (!adminAuth.isAuthenticated()) {
      router.replace("/admin-login");
    }
  }, [router]);

  const handleLogout = async () => {
    await adminAuth.logout();
    router.push("/admin-login");
  };

  return (
    <aside
      className={`flex flex-col h-screen border-r bg-card transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
      style={{ borderColor: "hsl(var(--sidebar-border))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold truncate">Admin</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-accent/50 transition-colors flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/users")
            : pathname === item.href;
          const label = t(item.labelKey);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
              title={collapsed ? label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer — logout */}
      <div className="p-2 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
          title={collapsed ? t("admin.nav.logout") : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{t("admin.nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
