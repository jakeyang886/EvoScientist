"use client";

import { useTheme } from "@/providers/theme-provider";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor, Languages, MessageSquarePlus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { SuggestionDialog } from "@/components/suggestions/suggestion-dialog";

const LANGUAGES = [
  { value: "zh-CN", label: "简体中文", short: "中" },
  { value: "en-US", label: "English", short: "EN" },
];

interface HeaderToolbarProps {
  showFeedback?: boolean;
}

export function HeaderToolbar({ showFeedback = true }: HeaderToolbarProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { i18n, t } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentLang = LANGUAGES.find((l) => l.value === i18n.language) || LANGUAGES[0];

  const themes = [
    { value: "light" as const, label: t("settings.light"), icon: Sun },
    { value: "dark" as const, label: t("settings.dark"), icon: Moon },
    { value: "system" as const, label: t("settings.system"), icon: Monitor },
  ];

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex items-center gap-1">
      {showFeedback && (
        <>
          <button
            onClick={() => {
              setFeedbackOpen(true);
              setLangOpen(false);
              setThemeOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={t("suggestions.title")}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
          <SuggestionDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        </>
      )}

      {/* Language Switcher */}
      <div ref={langRef} className="relative">
        <button
          onClick={() => {
            setLangOpen(!langOpen);
            setThemeOpen(false);
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={t("settings.language")}
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{currentLang.short}</span>
        </button>
        {langOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 rounded-lg border bg-popover shadow-lg z-50 min-w-[120px]">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                onClick={() => {
                  i18n.changeLanguage(l.value);
                  localStorage.setItem("language", l.value);
                  setLangOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  i18n.language === l.value
                    ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 font-medium"
                    : "text-foreground/80 hover:bg-accent/50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Theme Switcher */}
      <div ref={themeRef} className="relative">
        <button
          onClick={() => {
            setThemeOpen(!themeOpen);
            setLangOpen(false);
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={t("settings.theme")}
        >
          <ThemeIcon className="w-3.5 h-3.5" />
        </button>
        {themeOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 rounded-lg border bg-popover shadow-lg z-50 min-w-[120px]">
            {themes.map((th) => (
              <button
                key={th.value}
                onClick={() => {
                  setTheme(th.value);
                  setThemeOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  theme === th.value
                    ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 font-medium"
                    : "text-foreground/80 hover:bg-accent/50"
                }`}
              >
                <th.icon className="w-3.5 h-3.5" />
                <span>{th.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
