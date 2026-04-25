"use client";

import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FloatingInput } from "@/components/auth/floating-input";
import { SubmitButton } from "@/components/auth/submit-button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
      const res = await fetch(`${gatewayUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reset_url) setResetUrl(data.reset_url);
        setSent(true);
      } else {
        toast.error("请求失败，请重试");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ animation: "slide-up 0.4s ease-out" }}>
      {sent ? (
        /* Success state */
        <div className="text-center space-y-5">
          <div className="flex justify-center">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-xl shadow-emerald-500/25"
              style={{ animation: "check-bounce 0.6s ease-out" }}
            >
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-1">邮件已发送</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              如果该邮箱已注册，您会收到密码重置链接
            </p>
          </div>

          <div className="rounded-2xl border border-violet-200/80 dark:border-violet-500/20 bg-violet-50/80 dark:bg-violet-500/5 backdrop-blur-sm p-4 text-left">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-1">检查你的邮箱</p>
                <p className="text-xs text-violet-600/80 dark:text-violet-400/80 leading-relaxed">
                  点击邮件中的链接设置新密码。链接将在 1 小时后过期。
                </p>
              </div>
            </div>
          </div>

          {resetUrl && (
            <div className="rounded-2xl border border-amber-200/80 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/5 backdrop-blur-sm p-4 text-left space-y-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                邮件服务未配置，请直接使用以下链接重置密码：
              </p>
              <a
                href={resetUrl}
                className="block text-xs text-violet-600 dark:text-violet-400 hover:underline break-all leading-relaxed"
              >
                {resetUrl}
              </a>
            </div>
          )}

          <a
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 font-medium hover:text-violet-500 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回登录
          </a>
        </div>
      ) : (
        /* Form state */
        <>
          <div className="text-center mb-2">
            <h1 className="text-xl font-semibold tracking-tight">重置密码</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">输入注册邮箱，我们将发送重置链接</p>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <FloatingInput
                label="邮箱"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail className="w-4 h-4" />}
                placeholder="you@example.com"
                required
              />

              <SubmitButton loading={isLoading}>发送重置链接</SubmitButton>
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
        </>
      )}
    </div>
  );
}
