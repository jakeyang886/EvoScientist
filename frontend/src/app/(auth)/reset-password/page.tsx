"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("缺少重置令牌，请重新获取重置链接");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
      const res = await fetch(`${gatewayUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.ok) {
        setDone(true);
        toast.success("密码已重置");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "重置失败，链接可能已过期");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-5 text-center" style={{ animation: "slide-up 0.4s ease-out" }}>
        <div className="flex justify-center mb-4">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-xl shadow-emerald-500/25"
            style={{ animation: "check-bounce 0.6s ease-out" }}
          >
            <CheckCircle2 className="w-7 h-7 text-white" />
          </div>
        </div>

        <h2 className="text-xl font-semibold">密码已重置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          请使用新密码登录
        </p>

        <button
          onClick={() => router.push("/login")}
          className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
        >
          前往登录
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ animation: "slide-up 0.4s ease-out" }}>
      <div className="text-center mb-2">
        <h1 className="text-xl font-semibold tracking-tight">设置新密码</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          输入你的新密码
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            label="新密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength
            required
          />

          {error && (
            <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <SubmitButton loading={isLoading}>重置密码</SubmitButton>
        </form>
      </div>

      <div className="text-center">
        <a
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回登录
        </a>
      </div>
    </div>
  );
}
