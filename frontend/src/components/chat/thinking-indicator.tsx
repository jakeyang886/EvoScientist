"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const PHASES = ["正在连接", "正在思考", "分析中", "整理思路"];

interface ThinkingIndicatorProps {
  className?: string;
}

export function ThinkingIndicator({ className = "" }: ThinkingIndicatorProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((prev) => (prev + 1) % PHASES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Orbiting sparkles */}
      <div className="relative w-7 h-7 shrink-0">
        {/* Outer ring pulse */}
        <div className="absolute inset-0 rounded-full bg-violet-200/50 dark:bg-violet-800/30 animate-[ping_2s_ease-in-out_infinite]" />
        {/* Inner solid */}
        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* Phase text + bouncing dots */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground animate-pulse">
          {PHASES[phase]}
        </span>
        <span className="inline-flex items-center gap-[3px]">
          <span
            className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400"
            style={{ animation: "thinking-dot 1.4s ease-in-out infinite", animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400"
            style={{ animation: "thinking-dot 1.4s ease-in-out infinite", animationDelay: "200ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400"
            style={{ animation: "thinking-dot 1.4s ease-in-out infinite", animationDelay: "400ms" }}
          />
        </span>
      </div>
    </div>
  );
}
