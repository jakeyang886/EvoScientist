"use client";

import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { useAuth } from "@/providers/auth-provider";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // If we're done loading and not authenticated, force redirect to login
    if (!isLoading && !isAuthenticated) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
  }, [isAuthenticated, isLoading]);

  // Show nothing while loading or if not authenticated (redirect is happening)
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
