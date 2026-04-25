"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SidebarLogo({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
      {!collapsed && (
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight" style={{ color: "hsl(var(--sidebar-text))" }}>
            AI for Science
          </span>
        </div>
      )}
      {/* 折叠状态：不显示任何图标，只显示切换按钮 */}
      {collapsed && <div className="flex-1" />}
      <button
        onClick={onToggle}
        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
        aria-label="Toggle sidebar"
        style={{ color: "hsl(var(--sidebar-muted))" }}
      >
        {collapsed ? (
          <PanelLeftOpen className="w-4 h-4" />
        ) : (
          <PanelLeftClose className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
