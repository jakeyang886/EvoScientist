"use client";

import { useState, forwardRef, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  showStrength?: boolean;
}

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "弱", color: "bg-red-500" };
  if (score === 2) return { level: 2, label: "一般", color: "bg-orange-500" };
  if (score === 3) return { level: 3, label: "强", color: "bg-yellow-500" };
  return { level: 4, label: "很强", color: "bg-green-500" };
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label = "密码", showStrength = false, value, onChange, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const [focused, setFocused] = useState(false);
    const password = typeof value === "string" ? value : "";
    const strength = showStrength ? getPasswordStrength(password) : null;
    const isActive = focused || !!password;

    return (
      <div className="space-y-1.5">
        <div
          className={`relative rounded-xl border transition-all duration-200 ${
            focused
              ? "border-violet-400 dark:border-violet-500/50 ring-2 ring-violet-500/10"
              : "border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/50"
          }`}
        >
          {/* Label */}
          <label
            className={`absolute left-10 transition-all duration-200 pointer-events-none ${
              isActive
                ? "-top-2 left-3 text-[10px] font-medium px-1.5 py-0 rounded-md bg-white dark:bg-zinc-800"
                : "top-1/2 -translate-y-1/12 text-sm"
            } ${
              focused
                ? "text-violet-600 dark:text-violet-400"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {label}
          </label>

          {/* Input */}
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            className="w-full px-10 py-3 pr-10 text-sm bg-transparent focus:outline-none placeholder:text-transparent"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            value={value}
            onChange={onChange}
            {...props}
          />

          {/* Toggle visibility */}
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            tabIndex={-1}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Strength indicator */}
        {showStrength && strength && strength.level > 0 && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i <= strength.level ? strength.color : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 min-w-[24px]">{strength.label}</span>
          </div>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
