"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, AdminUser, PaginatedResponse } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Search,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Constants ──────────────────────────────────────────────────

const PLANS = ["starter", "pro", "max", "ultra"] as const;
const STATUSES = ["active", "suspended", "expired"] as const;
const PAGE_SIZE = 20;

// ─── Helpers ────────────────────────────────────────────────────

function formatNumber(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function planBadgeColor(plan: string): string {
  switch (plan) {
    case "pro": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "max": return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "ultra": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusDotColor(status: string): string {
  switch (status) {
    case "active": return "bg-emerald-500";
    case "suspended": return "bg-red-500";
    case "expired": return "bg-amber-500";
    default: return "bg-gray-400";
  }
}

// ─── Component ──────────────────────────────────────────────────

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Filters & pagination
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Dialog state
  const [rechargeUser, setRechargeUser] = useState<AdminUser | null>(null);
  // Recharge form
  const [rechargeType, setRechargeType] = useState<"tokens" | "days">("tokens");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeRemark, setRechargeRemark] = useState("");

  // Change plan dialog
  const [planChangeUser, setPlanChangeUser] = useState<AdminUser | null>(null);
  const [newPlan, setNewPlan] = useState("");

  // Build query params
  const queryParams = {
    ...(search ? { q: search } : {}),
    ...(planFilter ? { plan: planFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    page,
    size: PAGE_SIZE,
  };

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: ["admin-users", queryParams],
    queryFn: () => adminApi.users(queryParams),
  });

  const changeStatusMut = useMutation({
    mutationFn: ({ uid, status }: { uid: string; status: string }) =>
      adminApi.changeStatus(uid, status),
    onSuccess: () => {
      toast.success(t("admin.changeStatus.success"));
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error(t("admin.changeStatus.failed")),
  });

  const forceLogoutMut = useMutation({
    mutationFn: (uid: string) => adminApi.forceLogout(uid),
    onSuccess: () => {
      toast.success(t("admin.forceLogout.success"));
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error(t("admin.forceLogout.failed")),
  });

  const rechargeMut = useMutation({
    mutationFn: ({ uid, type, amount, remark }: { uid: string; type: "tokens" | "days"; amount: number; remark?: string }) =>
      adminApi.recharge(uid, type, amount, remark),
    onSuccess: () => {
      toast.success(t("admin.recharge.success"));
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      closeRechargeDialog();
    },
    onError: () => toast.error(t("admin.recharge.failed")),
  });

  const changePlanMut = useMutation({
    mutationFn: ({ uid, plan }: { uid: string; plan: string }) =>
      adminApi.changePlan(uid, plan),
    onSuccess: () => {
      toast.success(t("admin.changePlan.success"));
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setPlanChangeUser(null);
      setNewPlan("");
    },
    onError: () => toast.error(t("admin.changePlan.failed")),
  });

  const users = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  function closeRechargeDialog() {
    setRechargeUser(null);
    setRechargeType("tokens");
    setRechargeAmount("");
    setRechargeRemark("");
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
                <Users className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{t("admin.users.title")}</h1>
                <p className="text-sm text-muted-foreground">
                  {t("admin.users.total", { count: total })}
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
              title={t("admin.users.refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("admin.users.search")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Plan filter */}
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("admin.users.allPlans")}</option>
              {PLANS.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("admin.users.allStatus")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                {t("admin.users.loading")}
              </div>
            ) : isError ? (
              <div className="p-8 text-center text-sm text-destructive">
                {t("admin.users.loadFailed")}{" "}
                <button onClick={() => refetch()} className="underline hover:no-underline">
                  {t("admin.users.retry")}
                </button>
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("admin.users.noUsers")}</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.users.title")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.users.plan")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.users.status")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("admin.users.balanceExpiry")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("admin.users.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.uid} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          {/* User */}
                          <td className="px-4 py-3">
                            <div className="font-medium truncate max-w-[180px]" title={user.username}>
                              {user.username}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={user.email}>
                              {user.email}
                            </div>
                          </td>

                          {/* Plan */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${planBadgeColor(user.plan)}`}>
                              {user.plan}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <span className={`w-2 h-2 rounded-full ${statusDotColor(user.status)}`} />
                              {user.status}
                            </span>
                          </td>

                          {/* Balance / Expiry */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {user.token_balance != null ? (
                              <span className="font-medium tabular-nums">{formatNumber(user.token_balance)}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="text-xs text-muted-foreground">{formatDate(user.plan_expires_at)}</span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => setRechargeUser(user)}
                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60 transition-colors"
                              >
                                {t("admin.users.recharge")}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1.5 rounded-md hover:bg-accent/50 transition-colors">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      changeStatusMut.mutate({
                                        uid: user.uid,
                                        status: user.status === "active" ? "suspended" : "active",
                                      })
                                    }
                                    className={user.status === "active" ? "text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20" : ""}
                                  >
                                    {user.status === "active" ? t("admin.users.suspend") : t("admin.users.activate")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => forceLogoutMut.mutate(user.uid)}
                                    className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                                  >
                                    {t("admin.users.forceLogout")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setPlanChangeUser(user);
                                      setNewPlan(user.plan);
                                    }}
                                  >
                                    {t("admin.users.changePlan")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-md hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Recharge Dialog ── */}
      {rechargeUser && (
        <DialogOverlay onClose={closeRechargeDialog}>
          <div className="bg-card rounded-xl border shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("admin.recharge.title")}</h2>
              <button onClick={closeRechargeDialog} className="p-1.5 rounded-md hover:bg-accent/50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-muted-foreground">
              {t("admin.recharge.user")}: <span className="font-medium text-foreground">{rechargeUser.username}</span>
            </div>

            {/* Type toggle */}
            <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
              {(["tokens", "days"] as const).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setRechargeType(rt)}
                  className={`flex-1 py-2 text-sm rounded-md transition-all ${
                    rechargeType === rt
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rt === "tokens" ? t("admin.recharge.tokens") : t("admin.recharge.days")}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("admin.recharge.amount")} {rechargeType === "tokens" ? `(${t("admin.recharge.tokens").toLowerCase()})` : `(${t("admin.recharge.days").toLowerCase()})`}
              </label>
              <input
                type="number"
                min="1"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder={rechargeType === "tokens" ? "e.g. 100000" : "e.g. 30"}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Remark */}
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("admin.recharge.remark")}</label>
              <input
                type="text"
                value={rechargeRemark}
                onChange={(e) => setRechargeRemark(e.target.value)}
                placeholder={t("admin.recharge.remarkPlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Submit */}
            <button
              disabled={!rechargeAmount || Number(rechargeAmount) <= 0 || rechargeMut.isPending}
              onClick={() =>
                rechargeMut.mutate({
                  uid: rechargeUser.uid,
                  type: rechargeType,
                  amount: Number(rechargeAmount),
                  remark: rechargeRemark || undefined,
                })
              }
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rechargeMut.isPending ? t("admin.recharge.processing") : rechargeType === "tokens" ? t("admin.recharge.addTokens") : t("admin.recharge.addDays")}
            </button>
          </div>
        </DialogOverlay>
      )}

      {/* ── Change Plan Dialog ── */}
      {planChangeUser && (
        <DialogOverlay onClose={() => { setPlanChangeUser(null); setNewPlan(""); }}>
          <div className="bg-card rounded-xl border shadow-xl max-w-sm w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("admin.changePlan.title")}</h2>
              <button onClick={() => { setPlanChangeUser(null); setNewPlan(""); }} className="p-1.5 rounded-md hover:bg-accent/50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-muted-foreground">
              {t("admin.changePlan.user")}: <span className="font-medium text-foreground">{planChangeUser.username}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((p) => (
                <button
                  key={p}
                  onClick={() => setNewPlan(p)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    newPlan === p
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            <button
              disabled={!newPlan || newPlan === planChangeUser.plan || changePlanMut.isPending}
              onClick={() => changePlanMut.mutate({ uid: planChangeUser.uid, plan: newPlan })}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {changePlanMut.isPending ? "Updating..." : t("admin.changePlan.title")}
            </button>
          </div>
        </DialogOverlay>
      )}
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
