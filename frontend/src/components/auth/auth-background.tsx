"use client";

import { useEffect, useState } from "react";

export function AuthBackground() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-sky-50 dark:from-[#0a0a0f] dark:via-[#0f0f1a] dark:to-[#0a0a15]" />

      {/* Dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Floating orbs */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 bg-violet-400/20 dark:bg-violet-600/10 rounded-full blur-3xl"
        style={{ animation: "float-slow 12s ease-in-out infinite" }}
      />
      <div
        className="absolute top-1/3 -right-20 w-80 h-80 bg-sky-400/20 dark:bg-sky-600/10 rounded-full blur-3xl"
        style={{ animation: "float-medium 15s ease-in-out infinite" }}
      />
      <div
        className="absolute -bottom-40 left-1/3 w-72 h-72 bg-amber-300/15 dark:bg-amber-600/8 rounded-full blur-3xl"
        style={{ animation: "float-fast 18s ease-in-out infinite" }}
      />

      {/* Mouse follow glow */}
      <div
        className="absolute w-64 h-64 bg-violet-400/10 dark:bg-violet-500/5 rounded-full blur-3xl transition-transform duration-1000 ease-out"
        style={{
          transform: `translate(${mousePos.x - 128}px, ${mousePos.y - 128}px)`,
        }}
      />

      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
    </div>
  );
}
