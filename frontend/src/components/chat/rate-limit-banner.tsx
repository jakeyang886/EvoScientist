"use client";

import { AlertTriangle, Clock, CreditCard, Ban, X } from "lucide-react";
import { useState } from "react";

export interface BlockedInfo {
  code: string;
  message: string;
  status: number;
}

interface RateLimitBannerProps {
  blockedInfo: BlockedInfo | null;
  onDismiss?: () => void;
}

/** Maps error codes to icon + color theme */
function getTheme(code: string, status: number): {
  icon: typeof AlertTriangle;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
} {
  if (code.startsWith("RATE_LIMITED_REQUESTS_5H") || code.startsWith("RATE_LIMITED_PER_MINUTE")) {
    return {
      icon: Clock,
      bg: "bg-amber-50 dark:bg-amber-900/15",
      border: "border-amber-200 dark:border-amber-800/40",
      text: "text-amber-700 dark:text-amber-300",
      iconColor: "text-amber-500",
    };
  }
  if (code.startsWith("RATE_LIMITED_PER_DAY") || code.startsWith("RATE_LIMITED_REQUESTS_WEEK")) {
    return {
      icon: AlertTriangle,
      bg: "bg-orange-50 dark:bg-orange-900/15",
      border: "border-orange-200 dark:border-orange-800/40",
      text: "text-orange-700 dark:text-orange-300",
      iconColor: "text-orange-500",
    };
  }
  if (code === "INSUFFICIENT_BALANCE" || code === "SUBSCRIPTION_EXPIRED") {
    return {
      icon: CreditCard,
      bg: "bg-red-50 dark:bg-red-900/15",
      border: "border-red-200 dark:border-red-800/40",
      text: "text-red-700 dark:text-red-300",
      iconColor: "text-red-500",
    };
  }
  if (status === 403) {
    return {
      icon: Ban,
      bg: "bg-red-50 dark:bg-red-900/15",
      border: "border-red-200 dark:border-red-800/40",
      text: "text-red-700 dark:text-red-300",
      iconColor: "text-red-500",
    };
  }
  // Generic fallback
  return {
    icon: AlertTriangle,
    bg: "bg-muted/50",
    border: "border-border",
    text: "text-muted-foreground",
    iconColor: "text-muted-foreground",
  };
}

export function RateLimitBanner({ blockedInfo, onDismiss }: RateLimitBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!blockedInfo || dismissed) return null;

  const theme = getTheme(blockedInfo.code, blockedInfo.status);
  const Icon = theme.icon;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="max-w-3xl mx-auto mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${theme.bg} ${theme.border}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${theme.iconColor}`} />
        <span className={`text-sm font-medium ${theme.text} flex-1`}>
          {blockedInfo.message}
        </span>
        <button
          onClick={handleDismiss}
          className={`shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${theme.text} opacity-60 hover:opacity-100`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
