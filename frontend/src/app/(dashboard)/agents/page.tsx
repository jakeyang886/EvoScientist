"use client";

import { useTranslation } from "react-i18next";
import { Bot, Sparkles, Code2, Database, Search, Globe } from "lucide-react";
import { ChatHeader } from "@/components/chat/chat-header";

// 静态占位数据，后续可替换为 API 调用
const agents = [
  {
    id: "general-assistant",
    name: "通用助手",
    description: "日常对话、问题解答、写作辅助等多用途 AI 助手",
    icon: Sparkles,
    gradient: "from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20",
    iconColor: "text-violet-600 dark:text-violet-400",
    tags: ["通用", "对话"],
  },
  {
    id: "code-expert",
    name: "代码专家",
    description: "代码编写、调试、审查、重构，支持多种编程语言",
    icon: Code2,
    gradient: "from-sky-500/10 to-blue-500/10 dark:from-sky-500/20 dark:to-blue-500/20",
    iconColor: "text-sky-600 dark:text-sky-400",
    tags: ["开发", "代码"],
  },
  {
    id: "data-analyst",
    name: "数据分析师",
    description: "数据分析、可视化、统计建模、报告生成",
    icon: Database,
    gradient: "from-emerald-500/10 to-green-500/10 dark:from-emerald-500/20 dark:to-green-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    tags: ["数据", "分析"],
  },
  {
    id: "web-researcher",
    name: "网络研究员",
    description: "网页搜索、信息整理、文献调研、摘要生成",
    icon: Search,
    gradient: "from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    tags: ["搜索", "研究"],
  },
  {
    id: "translator",
    name: "翻译专家",
    description: "多语言翻译，支持中英日韩等主流语言",
    icon: Globe,
    gradient: "from-rose-500/10 to-pink-500/10 dark:from-rose-500/20 dark:to-pink-500/20",
    iconColor: "text-rose-600 dark:text-rose-400",
    tags: ["翻译", "语言"],
  },
  {
    id: "writing-assistant",
    name: "写作助手",
    description: "文章撰写、润色、改写、风格调整",
    icon: Bot,
    gradient: "from-indigo-500/10 to-blue-500/10 dark:from-indigo-500/20 dark:to-blue-500/20",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    tags: ["写作", "内容"],
  },
];

export default function AgentsPage() {
  const { t } = useTranslation();

  return (
    <>
      <ChatHeader />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-6 px-4">
          {/* 页头 */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-1">{t("agents.title") || "Agents"}</h1>
            <p className="text-sm text-muted-foreground">
              {t("agents.subtitle") || "选择或探索可用的 AI 助手"}
            </p>
          </div>

          {/* Agent 列表 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`flex flex-col p-4 rounded-xl border bg-gradient-to-br ${agent.gradient} hover:scale-[1.02] transition-transform duration-200 cursor-pointer`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-background/60 flex items-center justify-center shrink-0 ${agent.iconColor}`}>
                    <agent.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold mb-0.5">{agent.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{agent.description}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {agent.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-background/60 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
