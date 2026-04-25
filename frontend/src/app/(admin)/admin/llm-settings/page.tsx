"use client";

import { useTranslation } from "react-i18next";

import { LlmSettingsCard } from "@/components/admin/llm-settings-card";

export default function AdminLlmSettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("admin.nav.llmSettings")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.settings.llmDesc")}</p>
        </div>
        <LlmSettingsCard />
      </div>
    </div>
  );
}
