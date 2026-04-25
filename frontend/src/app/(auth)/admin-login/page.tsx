"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/api";
import { toast } from "sonner";
import { Mail, Lock, Shield } from "lucide-react";
import { FloatingInput } from "@/components/auth/floating-input";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already logged in as admin
  useEffect(() => {
    if (adminAuth.isAuthenticated()) {
      router.push("/admin");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await adminAuth.login(email, password);
      toast.success("管理员登录成功");
      router.push("/admin");
    } catch (err: any) {
      if (err?.code === "auth_account_locked") {
        toast.error("账户已被禁用");
      } else if (err?.code === "auth_login_failed") {
        toast.error("邮箱或密码错误");
      } else {
        toast.error(err.message || "登录失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ animation: "slide-up 0.4s ease-out" }}>
      {/* Header */}
      <div className="text-center mb-2">
        <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-3">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">管理员登录</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">管理后台入口</p>
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
            placeholder="admin@example.com"
            required
          />

          <PasswordInput
            label="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <SubmitButton loading={isLoading}>登录</SubmitButton>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center">
        <a
          href="/login"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-violet-500 transition-colors"
        >
          返回用户登录
        </a>
      </div>
    </div>
  );
}
