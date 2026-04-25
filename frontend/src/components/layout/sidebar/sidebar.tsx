"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SidebarNav, SidebarHistory } from "./sidebar-nav";
import { SidebarUploads } from "./sidebar-uploads";
import { SidebarLogo } from "./sidebar-logo";
import { SidebarUser } from "./sidebar-user";
import { GripHorizontal } from "lucide-react";

const MIN_PCT = 15;
const MAX_PCT = 85;
const DEFAULT_PCT = 55;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [historyPct, setHistoryPct] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar-history-pct");
      if (saved) {
        const n = parseFloat(saved);
        if (!isNaN(n) && n >= MIN_PCT && n <= MAX_PCT) return n;
      }
    }
    return DEFAULT_PCT;
  });
  const [isDragging, setIsDragging] = useState(false);

  // Persist ratio
  useEffect(() => {
    localStorage.setItem("sidebar-history-pct", String(historyPct));
  }, [historyPct]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startPct = historyPct;
    const containerEl = containerRef.current;
    if (!containerEl) return;

    // Cache container height at drag start to avoid reflow per frame
    const containerHeight = containerEl.clientHeight;
    if (containerHeight <= 0) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dy = moveEvent.clientY - startY;
      const delta = (dy / containerHeight) * 100;
      let newPct = startPct + delta;
      newPct = Math.max(MIN_PCT, Math.min(MAX_PCT, newPct));
      setHistoryPct(newPct);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    setIsDragging(true);
  }, [historyPct]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <aside
      className={`flex flex-col h-full border-r transition-all duration-200 ease-in-out ${
        collapsed ? "w-[52px]" : "w-[260px]"
      }`}
      style={{ backgroundColor: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}
    >
      <SidebarLogo collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <SidebarNav collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-h-0" ref={containerRef}>
        <SidebarHistory
          collapsed={collapsed}
          style={{ flex: `0 0 ${historyPct}%` }}
        />
        {/* Resize handle between history and uploads */}
        {!collapsed && (
          <div
            className={`
              shrink-0 cursor-row-resize select-none
              flex items-center justify-center
              transition-colors duration-150
              ${isDragging
                ? "bg-violet-500/30 h-5"
                : "h-3 hover:h-5 hover:bg-violet-500/20"
              }
            `}
            onMouseDown={handleMouseDown}
            title="拖拽调整高度"
          >
            <GripHorizontal
              className={`w-4 h-4 transition-colors duration-150 ${
                isDragging
                  ? "text-violet-500"
                  : "text-muted-foreground/30 hover:text-violet-500/60"
              }`}
            />
          </div>
        )}
        <SidebarUploads
          collapsed={collapsed}
          style={{ flex: `0 0 ${100 - historyPct}%` }}
        />
      </div>
      <SidebarUser collapsed={collapsed} />
    </aside>
  );
}
