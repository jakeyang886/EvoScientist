"use client";

import { Sparkles, MessageSquare, Zap, Code2, Shield, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const featureCards = [
  {
    icon: MessageSquare,
    title: "智能对话",
    desc: "与 AI 助手自然交流，获取精准回答",
    gradient: "from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    icon: Code2,
    title: "代码辅助",
    desc: "编写、审查、优化代码，提升开发效率",
    gradient: "from-sky-500/10 to-blue-500/10 dark:from-sky-500/20 dark:to-blue-500/20",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  {
    icon: Zap,
    title: "工具调用",
    desc: "自动调用外部工具完成复杂任务",
    gradient: "from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    icon: Shield,
    title: "安全保障",
    desc: "敏感操作需审批，确保运行安全",
    gradient: "from-emerald-500/10 to-green-500/10 dark:from-emerald-500/20 dark:to-green-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
];

// Rotating suggestion pools — different each visit to feel fresh
const SUGGESTION_POOLS = [
  ["解释一段代码的工作原理", "帮我写一个排序算法", "分析这个错误日志的原因"],
  ["总结一篇论文的核心贡献", "设计一个A/B测试方案", "对比两种机器学习方法的优劣"],
  ["帮我优化数据库查询性能", "写一个自动化测试脚本", "解释深度学习反向传播原理"],
  ["分析数据集的统计特征", "实现一个REST API接口", "审查这段代码的安全隐患"],
];

function getTodaySuggestions(): string[] {
  // Pick pool based on day of year so suggestions change daily
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return SUGGESTION_POOLS[dayOfYear % SUGGESTION_POOLS.length];
}

interface WelcomeScreenProps {
  onSendMessage?: (message: string) => void;
}

export function WelcomeScreen({ onSendMessage }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const suggestions = getTodaySuggestions();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo + Title */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-xl shadow-violet-500/20 mb-4">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">AI for Science</h1>
        <p className="text-sm text-muted-foreground">选择模型，输入消息开始对话</p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full mb-8">
        {featureCards.map((card) => (
          <div
            key={card.title}
            className={`flex items-start gap-3 p-4 rounded-xl border bg-gradient-to-br ${card.gradient} hover:scale-[1.02] transition-transform duration-200`}
          >
            <card.icon className={`w-5 h-5 shrink-0 mt-0.5 ${card.iconColor}`} />
            <div>
              <div className="text-sm font-medium mb-0.5">{card.title}</div>
              <div className="text-xs text-muted-foreground">{card.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions — clickable, sends suggestion as message */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSendMessage?.(suggestion)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border bg-card hover:bg-accent hover:border-violet-300 dark:hover:border-violet-600 transition-all cursor-pointer"
          >
            {suggestion}
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
