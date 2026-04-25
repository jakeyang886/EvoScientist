"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  children: React.ReactNode;
}

export function SubmitButton({ loading, children, disabled, className = "", ...props }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={`relative w-full py-3 px-4 rounded-xl font-medium text-sm text-white overflow-hidden transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 ${className}`}
      {...props}
    >
      {/* Shimmer effect */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700" />

      {loading ? (
        <span className="flex items-center justify-center gap-2 relative z-10">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </span>
      ) : (
        <span className="relative z-10">{children}</span>
      )}
    </button>
  );
}
