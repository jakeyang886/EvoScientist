"use client";

import { I18nextProvider } from "react-i18next";
import i18n from ".";
import { useEffect, useState } from "react";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("language") : null;
    if (saved && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
