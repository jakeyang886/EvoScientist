"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { User, Mail, KeyRound, CheckCircle2, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { FloatingInput } from "@/components/auth/floating-input";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [countdown, setCountdown] = useState(60);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/chat");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await register(username, email, password, inviteCode || undefined);
      setRegistered(true);
      setCountdown(60);
      // Start countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      toast.success("注册成功");
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("邮箱或用户名已被注册，请更换后重试");
      } else {
        toast.error(t("register.error"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Success page
  if (registered) {
    return (
      <div className="space-y-5 text-center" style={{ animation: "slide-up 0.4s ease-out" }}>
        {/* Animated check icon */}
        <div className="flex justify-center mb-4">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-xl shadow-emerald-500/25"
            style={{ animation: "check-bounce 0.6s ease-out, pulse-glow 2s ease-in-out infinite" }}
          >
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
        </div>

        <h2 className="text-xl font-semibold">注册成功</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          验证邮件已发送至 <strong className="text-zinc-700 dark:text-zinc-300">{email}</strong>
        </p>

        {/* Mail tip card */}
        <div className="rounded-2xl border border-violet-200/80 dark:border-violet-500/20 bg-violet-50/80 dark:bg-violet-500/5 backdrop-blur-sm p-4 text-left space-y-2">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-1">请查收验证邮件</p>
              <p className="text-xs text-violet-600/80 dark:text-violet-400/80 leading-relaxed">
                点击邮件中的链接完成验证后即可登录。如果未收到，请检查垃圾邮件文件夹。
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
          >
            前往登录
          </button>
          {countdown > 0 ? (
            <p className="text-xs text-zinc-400">
              {countdown} 秒后可重新发送邮件
            </p>
          ) : (
            <button
              onClick={() => {
                setCountdown(60);
                const timer = setInterval(() => {
                  setCountdown((prev) => {
                    if (prev <= 1) {
                      clearInterval(timer);
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
                toast.info("验证邮件已重新发送");
              }}
              className="text-sm text-violet-600 dark:text-violet-400 font-medium hover:text-violet-500 transition-colors"
            >
              重新发送验证邮件
            </button>
          )}
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="space-y-5" style={{ animation: "slide-up 0.4s ease-out" }}>
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-xl font-semibold tracking-tight">创建账户</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">开始你的 AI 研究之旅</p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-6 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingInput
            label={t("register.username")}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            icon={<User className="w-4 h-4" />}
            placeholder="用户名"
            required
          />

          <FloatingInput
            label={t("register.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            placeholder="you@example.com"
            required
          />

          <PasswordInput
            label={t("register.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength
            required
          />

          {/* Collapsible invite code */}
          <div>
            {!showInvite ? (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                <KeyRound className="w-3 h-3" />
                有邀请码？点击输入
                <ChevronDown className="w-3 h-3" />
              </button>
            ) : (
              <div style={{ animation: "slide-up 0.2s ease-out" }}>
                <FloatingInput
                  label={t("register.inviteCode")}
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  icon={<KeyRound className="w-4 h-4" />}
                  placeholder="输入邀请码（可选）"
                  suffix={
                    <button
                      type="button"
                      onClick={() => {
                        setShowInvite(false);
                        setInviteCode("");
                      }}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  }
                />
              </div>
            )}
          </div>

          <SubmitButton loading={isLoading}>{t("register.submit")}</SubmitButton>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("register.hasAccount")}</span>
        <a
          href="/login"
          className="text-sm text-violet-600 dark:text-violet-400 font-medium hover:text-violet-500 ml-1 inline-flex items-center gap-1 transition-colors"
        >
          立即登录
          <ArrowLeft className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
