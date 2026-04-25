"use client";

import { useModels } from "@/hooks/use-threads";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Cpu, Check, Zap } from "lucide-react";

interface ModelSelectorProps {
  onModelChange?: (model: string) => void;
  onEffortChange?: (effort: "low" | "medium" | "high") => void;
  selectedModel?: string;
  selectedEffort?: "low" | "medium" | "high";
  compact?: boolean;
}

const providerColors: Record<string, string> = {
  anthropic: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  openai: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  google: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
};

const providerLabels: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

const effortLabels: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function ModelSelector({
  onModelChange,
  onEffortChange,
  selectedModel: externalModel,
  selectedEffort: externalEffort,
  compact = false,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const { data } = useModels();
  const [selected, setSelected] = useState(externalModel || "");
  const [effort, setEffort] = useState<"low" | "medium" | "high">(externalEffort || "medium");
  const [open, setOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync with external props
  useEffect(() => {
    if (externalModel) setSelected(externalModel);
  }, [externalModel]);

  useEffect(() => {
    if (externalEffort) setEffort(externalEffort);
  }, [externalEffort]);

  useEffect(() => {
    if (data?.default_model && !selected && !externalModel) {
      setSelected(data.default_model);
    }
  }, [data, selected, externalModel]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEffortOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleModelChange = (model: string) => {
    const nextModel = data?.models.find((m) => m.id === model);
    setSelected(model);
    onModelChange?.(model);
    localStorage.setItem("model", model);
    // If selected model does not support reasoning, force effort back to medium
    // so we don't carry over stale low/high settings from other models.
    if (nextModel && !nextModel.supports_reasoning && effort !== "medium") {
      setEffort("medium");
      onEffortChange?.("medium");
      localStorage.setItem("reasoning_effort", "medium");
    }
    setOpen(false);
  };

  const handleEffortChange = (e: "low" | "medium" | "high") => {
    setEffort(e);
    onEffortChange?.(e);
    localStorage.setItem("reasoning_effort", e);
    setEffortOpen(false);
  };

  const currentModel = data?.models.find((m) => m.id === selected);
  const supportsReasoning = !!currentModel?.supports_reasoning;

  // Loading skeleton — show placeholder while fetching
  if (!data?.models) {
    return (
      <div className="flex items-center gap-2" ref={ref}>
        <div className={`animate-pulse rounded-lg border bg-muted/50 ${
          compact ? "px-2.5 py-1.5 h-7 w-24" : "px-3 py-1.5 h-8 w-32"
        }`} />
        <div className={`animate-pulse rounded-lg border bg-muted/50 ${
          compact ? "px-2.5 py-1.5 h-7 w-14" : "px-2.5 py-1.5 h-8 w-16"
        }`} />
      </div>
    );
  }

  const btnClass = compact
    ? "flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-accent/50 transition-colors"
    : "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border bg-card hover:bg-accent/50 transition-colors";

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {/* Model selector */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={btnClass}
        >
          {!compact && <Cpu className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className={compact ? "text-xs font-medium" : "font-medium"}>{currentModel?.name || "选择模型"}</span>
          {currentModel && !compact && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium">
              {providerLabels[currentModel.provider] || currentModel.provider}
            </span>
          )}
          {currentModel && compact && (
            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${providerColors[currentModel.provider] || ""}`}>
              {currentModel.provider}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 bottom-full mb-2 w-64 rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
            <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto scrollbar-thin">
              {data.models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
                >
                  {selected === m.id ? (
                    <Check className="w-4 h-4 text-violet-600 shrink-0" />
                  ) : (
                    <div className="w-4 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {providerLabels[m.provider] || m.provider}
                      {m.supports_vision && " · 视觉"}
                      {m.supports_reasoning && " · 推理"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Effort selector (only for reasoning-capable models) */}
      {supportsReasoning && (
        <div className="relative">
          <button
            onClick={() => setEffortOpen(!effortOpen)}
            className={btnClass}
          >
            {!compact && <Zap className="w-3.5 h-3.5 text-amber-500" />}
            <span className={compact ? "text-xs font-medium" : "text-xs font-medium"}>
              {compact ? effortLabels[effort] : `推理 ${effortLabels[effort]}`}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          {effortOpen && (
            <div className="absolute left-0 bottom-full mb-2 w-36 rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
              <div className="p-1.5 space-y-0.5">
                {(["low", "medium", "high"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => handleEffortChange(e)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg hover:bg-accent/60 transition-colors text-left"
                  >
                    {effort === e ? (
                      <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                    ) : (
                      <div className="w-3.5 shrink-0" />
                    )}
                    <span className="text-sm">{effortLabels[e]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
