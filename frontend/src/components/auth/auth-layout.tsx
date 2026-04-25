"use client";

import { Sparkles, MessageSquare, Code2, Zap, Shield } from "lucide-react";
import { AuthBackground } from "./auth-background";

const features = [
  {
    icon: MessageSquare,
    title: "智能对话",
    desc: "与 AI 助手自然交流，获取精准回答",
    gradient: "from-violet-500/10 to-purple-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    icon: Code2,
    title: "代码辅助",
    desc: "编写、审查、优化代码，提升开发效率",
    gradient: "from-sky-500/10 to-blue-500/10",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  {
    icon: Zap,
    title: "工具调用",
    desc: "自动调用外部工具完成复杂任务",
    gradient: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex overflow-hidden">
      <AuthBackground />

      {/* Left brand panel - desktop only */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-center px-10 xl:px-16 relative z-10">
        {/* Logo + Tagline */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-xl shadow-violet-500/25">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">EvoScientist</span>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            AI Research Agent Platform
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
            智能研究代理，让复杂工作更简单
          </p>
        </div>

        {/* Feature cards - tighter spacing */}
        <div className="space-y-2.5">
          {features.map((f) => (
            <div
              key={f.title}
              className={`flex items-start gap-3.5 p-3.5 rounded-xl border bg-white/50 dark:bg-zinc-800/30 backdrop-blur-sm bg-gradient-to-br ${f.gradient} transition-transform hover:scale-[1.02]`}
            >
              <f.icon className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${f.iconColor}`} />
              <div>
                <div className="text-sm font-semibold mb-0.5">{f.title}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom security note */}
        <div className="mt-8 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
          <Shield className="w-3.5 h-3.5" />
          <span>安全加密 · 隐私保护</span>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">EvoScientist</span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
