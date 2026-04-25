"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/providers/theme-provider";

export function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme}
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        style: {
          borderRadius: "var(--radius)",
          fontSize: "0.875rem",
        },
      }}
    />
  );
}
