"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("缺少验证令牌");
      return;
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: "GET",
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "邮箱验证成功！");
        } else {
          setStatus("error");
          setMessage(data.message || "验证失败，令牌可能已过期或无效");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("网络错误，请稍后重试");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-zinc-950 dark:to-zinc-900 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-8 text-center space-y-6">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-violet-500" />
              <h1 className="text-xl font-semibold tracking-tight">正在验证邮箱...</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">请稍候</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
              <h1 className="text-xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                邮箱验证成功！
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25"
              >
                去登录
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 mx-auto text-red-500" />
              <h1 className="text-xl font-semibold tracking-tight text-red-600 dark:text-red-400">
                验证失败
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25"
              >
                返回登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-zinc-950 dark:to-zinc-900 px-4">
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/50 backdrop-blur-xl shadow-xl p-8 text-center space-y-6">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-violet-500" />
          <h1 className="text-xl font-semibold tracking-tight">正在验证邮箱...</h1>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
