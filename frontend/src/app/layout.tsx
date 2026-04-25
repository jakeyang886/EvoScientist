import type { Metadata } from "next";
import localFont from "next/font/local";
import "../styles/globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import { ThemedToaster } from "@/components/ui/themed-toaster";

const inter = localFont({
  src: [
    { path: "../../public/fonts/Inter-Regular.woff2", weight: "400" },
    { path: "../../public/fonts/Inter-Medium.woff2", weight: "500" },
    { path: "../../public/fonts/Inter-SemiBold.woff2", weight: "600" },
    { path: "../../public/fonts/Inter-Bold.woff2", weight: "700" },
  ],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EvoScientist",
  description: "AI Research Agent — Web Interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider>
          <QueryProvider>
            <I18nProvider>
              <AuthProvider>
                {children}
                <ThemedToaster />
              </AuthProvider>
            </I18nProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
