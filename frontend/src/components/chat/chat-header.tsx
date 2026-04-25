"use client";

import { usePathname } from "next/navigation";
import { useThreads } from "@/hooks/use-threads";
import { useMemo } from "react";
import { HeaderToolbar } from "@/components/layout/header-toolbar";

export function ChatHeader() {
  const pathname = usePathname();
  const { data } = useThreads();

  // Extract current threadId from URL
  const currentThreadId = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Find the current thread's title
  const currentTitle = useMemo(() => {
    if (!currentThreadId || !data?.threads) return null;
    const thread = data.threads.find((t) => t.thread_id === currentThreadId);
    return thread?.title || null;
  }, [currentThreadId, data?.threads]);

  return (
    <header className="flex items-center h-12 px-4 border-b bg-background/80 backdrop-blur-sm">
      {/* Left spacer — balances the right-side toolbar */}
      <div className="flex-1 min-w-0" />
      {/* Center — thread title */}
      <span className="text-sm font-medium text-muted-foreground truncate max-w-md shrink-0">
        {currentTitle || "AI for Science"}
      </span>
      {/* Right — language & theme toolbar */}
      <div className="flex-1 flex justify-end min-w-0">
        <HeaderToolbar />
      </div>
    </header>
  );
}
