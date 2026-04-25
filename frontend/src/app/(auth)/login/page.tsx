"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { Mail, Lock, AlertCircle, Send, Loader2, ArrowRight } from "lucide-react";
import { FloatingInput } from "@/components/auth/floating-input";
import { PasswordInput } from "@/components/auth/password-input";
import { ToggleSwitch } from "@/components/auth/toggle-switch";
import { SubmitButton } from "@/components/auth/submit-button";

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback") || "/chat";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.push(callback);
    }
  }, [isAuthenticated, router, callback]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password, remember);
      toast.success("登录成功");
      router.push(callback);
    } catch (err: any) {
      if (err?.code === "auth_email_not_verified") {
        setShowResend(true);
        setResendEmail(email);
      } else if (err?.code === "auth_account_locked") {
        toast.error(err.message || "账户已被锁定");
      } else if (err?.code === "auth_login_failed") {
        toast.error("邮箱或密码错误");
      } else {
        toast.error(err.message || "登录失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail) return;
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      if (res.ok) {
        setResendSent(true);
        toast.success("验证邮件已重新发送");
      } else {
        toast.error("发送失败，请检查邮箱");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ animation: "slide-up 0.4s ease-out" }}>
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-xl font-semibold tracking-tight">欢迎回来</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">登录你的账户以继续</p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-6 space-y-4">
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

          <PasswordInput
            label="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex items-center justify-between">
            <ToggleSwitch checked={remember} onChange={setRemember} label="记住密码" />
            <a
              href="/forgot-password"
              className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium transition-colors"
            >
              忘记密码？
            </a>
          </div>

          <SubmitButton loading={isLoading}>登录</SubmitButton>
        </form>
      </div>

      {/* Email verification prompt */}
      {showResend && (
        <div
          className="rounded-2xl border border-amber-200/80 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/5 backdrop-blur-sm p-4 space-y-3"
          style={{ animation: "slide-up 0.3s ease-out" }}
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">请先验证邮箱</span>
          </div>

          {resendSent ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
              验证邮件已发送至 <strong>{resendEmail}</strong>，请查收并点击验证链接。
            </p>
          ) : (
            <>
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                您的邮箱尚未验证，请先查收注册邮件并点击验证链接。
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  placeholder="输入注册邮箱"
                />
                <button
                  onClick={handleResend}
                  disabled={resendLoading || !resendEmail}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors shrink-0"
                >
                  {resendLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      重发
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">没有账户？</span>
        <a
          href="/register"
          className="text-sm text-violet-600 dark:text-violet-400 font-medium hover:text-violet-500 ml-1 inline-flex items-center gap-1 transition-colors"
        >
          立即注册
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
