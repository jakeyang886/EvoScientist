"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: string;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, icon, suffix, error, className = "", ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);

    const isActive = focused || hasValue;

    return (
      <div className="relative">
        <div
          className={`relative rounded-xl border transition-all duration-200 ${
            error
              ? "border-red-300 dark:border-red-500/50 bg-red-50/30 dark:bg-red-500/5"
              : focused
                ? "border-violet-400 dark:border-violet-500/50 ring-2 ring-violet-500/10"
                : "border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/50"
          }`}
        >
          {/* Label */}
          <label
            className={`absolute left-10 transition-all duration-200 pointer-events-none ${
              isActive
                ? "-top-2 left-3 text-[10px] font-medium px-1.5 py-0 rounded-md bg-white dark:bg-zinc-800"
                : "top-1/2 -translate-y-1/2 text-sm"
            } ${
              error
                ? "text-red-500"
                : isActive
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {label}
          </label>

          {/* Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
              {icon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            className={`w-full px-10 py-3 text-sm bg-transparent focus:outline-none placeholder:text-transparent ${icon ? "pl-10" : "pl-4"} ${suffix ? "pr-10" : "pr-4"}`}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              setFocused(false);
              setHasValue(!!e.target.value);
            }}
            onChange={(e) => {
              setHasValue(!!e.target.value);
              props.onChange?.(e);
            }}
            {...props}
          />

          {/* Suffix */}
          {suffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {suffix}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-1.5 ml-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

FloatingInput.displayName = "FloatingInput";
