"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Braces,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AdminLlmProviderConfig, AdminLlmSettings, adminApi } from "@/lib/api";

type EditorMode = "visual" | "json";

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function cloneSettings(value: AdminLlmSettings): AdminLlmSettings {
  return JSON.parse(JSON.stringify(value)) as AdminLlmSettings;
}

function countModels(settings: AdminLlmSettings | null) {
  if (!settings) return 0;
  return Object.values(settings.providers || {}).reduce((acc, provider) => acc + provider.models.length, 0);
}

function createDefaultProvider(): AdminLlmProviderConfig {
  return {
    api_key: "",
    base_url: "",
    protocol: "openai",
    extra_body: {},
    default_headers: {},
    models: [],
    endpoints: [],
  };
}

export function LlmSettingsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
  const [editorValue, setEditorValue] = useState("");
  const [lastLoadedValue, setLastLoadedValue] = useState("");
  const [parseError, setParseError] = useState("");
  const lastLoadedRef = useRef("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-llm-settings"],
    queryFn: () => adminApi.getLlmSettings(),
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    const pretty = toPrettyJson(data);
    setEditorValue((current) => {
      if (!current || current === lastLoadedRef.current) return pretty;
      return current;
    });
    lastLoadedRef.current = pretty;
    setLastLoadedValue(pretty);
  }, [data]);

  let parsedDraft: AdminLlmSettings | null = null;
  if (editorValue.trim()) {
    try {
      parsedDraft = JSON.parse(editorValue) as AdminLlmSettings;
    } catch {
      parsedDraft = null;
    }
  }

  const activeConfig = parsedDraft || data || null;
  const providerCount = activeConfig ? Object.keys(activeConfig.providers || {}).length : 0;
  const modelCount = countModels(activeConfig);
  const hasChanges = editorValue !== lastLoadedValue;

  const saveMutation = useMutation({
    mutationFn: async (payload: AdminLlmSettings) => adminApi.updateLlmSettings(payload),
    onSuccess: () => {
      setLastLoadedValue(editorValue);
      lastLoadedRef.current = editorValue;
      toast.success(t("admin.settings.llmSaved"));
      queryClient.invalidateQueries({ queryKey: ["admin-llm-settings"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setParseError("");
    },
    onError: (err: any) => {
      toast.error(err?.message || t("admin.settings.saveFailed"));
    },
  });

  const applyVisualUpdate = (updater: (cfg: AdminLlmSettings) => void) => {
    if (!parsedDraft) {
      setEditorMode("json");
      toast.error(t("admin.settings.llmInvalidJsonSwitch"));
      return;
    }
    const next = cloneSettings(parsedDraft);
    updater(next);
    setEditorValue(toPrettyJson(next));
    setParseError("");
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(editorValue);
      setEditorValue(toPrettyJson(parsed));
      setParseError("");
    } catch (err: any) {
      const message = err?.message || t("admin.settings.llmJsonInvalid");
      setParseError(message);
      toast.error(message);
    }
  };

  const handleReset = () => {
    setEditorValue(lastLoadedValue);
    setParseError("");
  };

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(editorValue) as AdminLlmSettings;
      setParseError("");
      await saveMutation.mutateAsync(parsed);
    } catch (err: any) {
      const message = err?.message || t("admin.settings.llmJsonInvalid");
      setParseError(message);
      toast.error(message);
    }
  };

  const addProvider = () => {
    applyVisualUpdate((cfg) => {
      let idx = Object.keys(cfg.providers).length + 1;
      let key = `provider-${idx}`;
      while (cfg.providers[key]) {
        idx += 1;
        key = `provider-${idx}`;
      }
      cfg.providers[key] = createDefaultProvider();
    });
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="p-5 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4" />
              {t("admin.settings.llmTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin.settings.llmDesc")}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {t("admin.settings.llmConfigPath")}: <code>.config/config.yaml</code>
              </span>
              <span className="text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {t("admin.settings.llmDefaultModel")}: {activeConfig?.default_model || "-"}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {t("admin.settings.llmProviders")}: {providerCount}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {t("admin.settings.llmModels")}: {modelCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setEditorMode("visual")}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  editorMode === "visual" ? "bg-violet-600 text-white" : "hover:bg-muted/60"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {t("admin.settings.llmVisualMode")}
                </span>
              </button>
              <button
                onClick={() => setEditorMode("json")}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  editorMode === "json" ? "bg-violet-600 text-white" : "hover:bg-muted/60"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Braces className="w-3.5 h-3.5" />
                  {t("admin.settings.llmJsonMode")}
                </span>
              </button>
            </div>

            <button
              onClick={handleFormat}
              disabled={isLoading || saveMutation.isPending || !editorValue}
              className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="inline-flex items-center gap-1.5">
                <Braces className="w-3.5 h-3.5" />
                {t("admin.settings.llmFormat")}
              </span>
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading || saveMutation.isPending || !hasChanges}
              className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                {t("admin.settings.undoChanges")}
              </span>
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || saveMutation.isPending || !hasChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {t("admin.settings.save")}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t("admin.settings.loading")}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {t("admin.settings.loadFailed")}
            </span>
            <button onClick={() => refetch()} className="underline underline-offset-2">
              {t("admin.settings.retry")}
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {editorMode === "visual" ? (
              <>
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  {t("admin.settings.llmVisualHint")}
                </div>

                {!parsedDraft ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
                    <span className="inline-flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {t("admin.settings.llmInvalidJsonSwitch")}
                    </span>
                    <button
                      onClick={() => setEditorMode("json")}
                      className="underline underline-offset-2"
                    >
                      {t("admin.settings.llmSwitchToJson")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border bg-background p-4 space-y-4">
                      <h3 className="text-sm font-medium">{t("admin.settings.llmGlobalConfig")}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {t("admin.settings.llmDefaultModel")}
                          </label>
                          <input
                            type="text"
                            value={parsedDraft.default_model || ""}
                            onChange={(e) =>
                              applyVisualUpdate((cfg) => {
                                cfg.default_model = e.target.value;
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {t("admin.settings.llmTemperature")}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={parsedDraft.model_defaults.temperature ?? ""}
                            onChange={(e) =>
                              applyVisualUpdate((cfg) => {
                                cfg.model_defaults.temperature = e.target.value === "" ? null : Number(e.target.value);
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {t("admin.settings.llmMaxTokens")}
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={parsedDraft.model_defaults.max_tokens}
                            onChange={(e) =>
                              applyVisualUpdate((cfg) => {
                                cfg.model_defaults.max_tokens = Number(e.target.value) || 1;
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {t("admin.settings.llmReasoningEffort")}
                          </label>
                          <select
                            value={parsedDraft.model_defaults.reasoning_effort}
                            onChange={(e) =>
                              applyVisualUpdate((cfg) => {
                                cfg.model_defaults.reasoning_effort = e.target.value;
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                          >
                            <option value="low">{t("admin.settings.llmEffortLow")}</option>
                            <option value="medium">{t("admin.settings.llmEffortMedium")}</option>
                            <option value="high">{t("admin.settings.llmEffortHigh")}</option>
                            <option value="xhigh">{t("admin.settings.llmEffortXhigh")}</option>
                          </select>
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={parsedDraft.model_defaults.stream_usage}
                          onChange={(e) =>
                            applyVisualUpdate((cfg) => {
                              cfg.model_defaults.stream_usage = e.target.checked;
                            })
                          }
                          className="rounded border"
                        />
                        {t("admin.settings.llmStreamUsage")}
                      </label>
                    </div>

                    <div className="rounded-xl border bg-background p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">{t("admin.settings.llmProvidersConfig")}</h3>
                        <button
                          onClick={addProvider}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t("admin.settings.llmAddProvider")}
                        </button>
                      </div>

                      {Object.entries(parsedDraft.providers).length === 0 && (
                        <div className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-2">
                          {t("admin.settings.llmNoProviders")}
                        </div>
                      )}

                      {Object.entries(parsedDraft.providers).map(([providerName, provider]) => (
                        <div key={providerName} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <label className="text-xs text-muted-foreground mb-1 block">
                                {t("admin.settings.llmProviderName")}
                              </label>
                              <input
                                type="text"
                                defaultValue={providerName}
                                onBlur={(e) => {
                                  const newName = e.target.value.trim();
                                  if (!newName || newName === providerName) {
                                    e.currentTarget.value = providerName;
                                    return;
                                  }
                                  applyVisualUpdate((cfg) => {
                                    if (cfg.providers[newName]) {
                                      toast.error(t("admin.settings.llmProviderNameExists"));
                                      return;
                                    }
                                    cfg.providers[newName] = cfg.providers[providerName];
                                    delete cfg.providers[providerName];
                                  });
                                }}
                                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() =>
                                applyVisualUpdate((cfg) => {
                                  delete cfg.providers[providerName];
                                })
                              }
                              className="mt-5 inline-flex items-center gap-1.5 px-2.5 py-2 text-xs rounded-lg border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t("common.delete")}
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                {t("admin.settings.llmProviderProtocol")}
                              </label>
                              <select
                                value={provider.protocol}
                                onChange={(e) =>
                                  applyVisualUpdate((cfg) => {
                                    cfg.providers[providerName].protocol = e.target.value as AdminLlmProviderConfig["protocol"];
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                              >
                                <option value="openai">openai</option>
                                <option value="anthropic">anthropic</option>
                                <option value="google-genai">google-genai</option>
                                <option value="ollama">ollama</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                {t("admin.settings.llmApiKey")}
                              </label>
                              <input
                                type="text"
                                value={provider.api_key}
                                onChange={(e) =>
                                  applyVisualUpdate((cfg) => {
                                    cfg.providers[providerName].api_key = e.target.value;
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                {t("admin.settings.llmBaseUrl")}
                              </label>
                              <input
                                type="text"
                                value={provider.base_url}
                                onChange={(e) =>
                                  applyVisualUpdate((cfg) => {
                                    cfg.providers[providerName].base_url = e.target.value;
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            {t("admin.settings.llmAdvancedJsonOnly")}
                            {" "}
                            `extra_body/default_headers/params`
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-medium">{t("admin.settings.llmEndpoints")}</h4>
                              <button
                                onClick={() =>
                                  applyVisualUpdate((cfg) => {
                                    cfg.providers[providerName].endpoints.push({
                                      name: "",
                                      api_key: "",
                                      base_url: "",
                                      weight: 1,
                                      extra_body: {},
                                      default_headers: {},
                                    });
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-muted/50 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                {t("admin.settings.llmAddEndpoint")}
                              </button>
                            </div>

                            {provider.endpoints.length === 0 && (
                              <div className="text-xs text-muted-foreground rounded border border-dashed px-3 py-2">
                                {t("admin.settings.llmNoEndpoints")}
                              </div>
                            )}

                            {provider.endpoints.map((endpoint, endpointIndex) => (
                              <div key={`${providerName}-ep-${endpointIndex}`} className="grid grid-cols-12 gap-2">
                                <input
                                  type="text"
                                  placeholder={t("admin.settings.llmEndpointName")}
                                  value={endpoint.name}
                                  onChange={(e) =>
                                    applyVisualUpdate((cfg) => {
                                      cfg.providers[providerName].endpoints[endpointIndex].name = e.target.value;
                                    })
                                  }
                                  className="col-span-2 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("admin.settings.llmApiKey")}
                                  value={endpoint.api_key}
                                  onChange={(e) =>
                                    applyVisualUpdate((cfg) => {
                                      cfg.providers[providerName].endpoints[endpointIndex].api_key = e.target.value;
                                    })
                                  }
                                  className="col-span-3 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("admin.settings.llmBaseUrl")}
                                  value={endpoint.base_url}
                                  onChange={(e) =>
                                    applyVisualUpdate((cfg) => {
                                      cfg.providers[providerName].endpoints[endpointIndex].base_url = e.target.value;
                                    })
                                  }
                                  className="col-span-5 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  value={endpoint.weight}
                                  onChange={(e) =>
                                    applyVisualUpdate((cfg) => {
                                      cfg.providers[providerName].endpoints[endpointIndex].weight = Number(e.target.value) || 1;
                                    })
                                  }
                                  className="col-span-1 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                />
                                <button
                                  onClick={() =>
                                    applyVisualUpdate((cfg) => {
                                      cfg.providers[providerName].endpoints.splice(endpointIndex, 1);
                                    })
                                  }
                                  className="col-span-1 inline-flex items-center justify-center rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-medium">{t("admin.settings.llmModels")}</h4>
                              <button
                                onClick={() =>
                                  applyVisualUpdate((cfg) => {
                                    cfg.providers[providerName].models.push({
                                      id: "",
                                      alias: "",
                                      max_tokens: 4096,
                                      supports_vision: false,
                                      supports_reasoning: false,
                                      endpoint: "",
                                      params: {},
                                    });
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-muted/50 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                {t("admin.settings.llmAddModel")}
                              </button>
                            </div>

                            {provider.models.length === 0 && (
                              <div className="text-xs text-muted-foreground rounded border border-dashed px-3 py-2">
                                {t("admin.settings.llmNoModels")}
                              </div>
                            )}

                            {provider.models.map((model, modelIndex) => (
                              <div key={`${providerName}-model-${modelIndex}`} className="rounded border p-2 space-y-2">
                                <div className="grid grid-cols-12 gap-2">
                                  <input
                                    type="text"
                                    placeholder={t("admin.settings.llmModelId")}
                                    value={model.id}
                                    onChange={(e) =>
                                      applyVisualUpdate((cfg) => {
                                        cfg.providers[providerName].models[modelIndex].id = e.target.value;
                                      })
                                    }
                                    className="col-span-4 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    placeholder={t("admin.settings.llmModelAlias")}
                                    value={model.alias}
                                    onChange={(e) =>
                                      applyVisualUpdate((cfg) => {
                                        cfg.providers[providerName].models[modelIndex].alias = e.target.value;
                                      })
                                    }
                                    className="col-span-3 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    value={model.max_tokens}
                                    onChange={(e) =>
                                      applyVisualUpdate((cfg) => {
                                        cfg.providers[providerName].models[modelIndex].max_tokens = Number(e.target.value) || 1;
                                      })
                                    }
                                    className="col-span-2 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                  />
                                  <select
                                    value={model.endpoint}
                                    onChange={(e) =>
                                      applyVisualUpdate((cfg) => {
                                        cfg.providers[providerName].models[modelIndex].endpoint = e.target.value;
                                      })
                                    }
                                    className="col-span-2 px-2 py-1.5 rounded border bg-background text-xs focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                                  >
                                    <option value="">{t("admin.settings.llmEndpointAuto")}</option>
                                    {provider.endpoints.map((ep, idx) => (
                                      <option key={`${providerName}-ep-opt-${idx}`} value={ep.name}>
                                        {ep.name || `${t("admin.settings.llmEndpointName")} #${idx + 1}`}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() =>
                                      applyVisualUpdate((cfg) => {
                                        cfg.providers[providerName].models.splice(modelIndex, 1);
                                      })
                                    }
                                    className="col-span-1 inline-flex items-center justify-center rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-4 text-xs">
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={model.supports_vision}
                                      onChange={(e) =>
                                        applyVisualUpdate((cfg) => {
                                          cfg.providers[providerName].models[modelIndex].supports_vision = e.target.checked;
                                        })
                                      }
                                      className="rounded border"
                                    />
                                    {t("admin.settings.llmSupportsVision")}
                                  </label>
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={model.supports_reasoning}
                                      onChange={(e) =>
                                        applyVisualUpdate((cfg) => {
                                          cfg.providers[providerName].models[modelIndex].supports_reasoning = e.target.checked;
                                        })
                                      }
                                      className="rounded border"
                                    />
                                    {t("admin.settings.llmSupportsReasoning")}
                                  </label>
                                  <span className="text-muted-foreground">
                                    {t("admin.settings.llmSupportsReasoningHint")}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t("admin.settings.llmModelParamsHint")}: {Object.keys(model.params || {}).length}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  {t("admin.settings.llmHint")}
                </div>
                <textarea
                  value={editorValue}
                  onChange={(e) => {
                    setEditorValue(e.target.value);
                    if (parseError) setParseError("");
                  }}
                  spellCheck={false}
                  className="min-h-[420px] w-full rounded-xl border bg-background px-4 py-3 font-mono text-xs leading-6 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />

                {parseError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{parseError}</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{t("admin.settings.llmHintJson")}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
