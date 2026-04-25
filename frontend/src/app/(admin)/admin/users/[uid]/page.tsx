"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  User,
  CreditCard,
  Activity,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  LogOut,
  Coins,
  CalendarClock,
} from "lucide-react";
import { adminApi, type AdminUserDetail } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

const PLANS = ["starter", "pro", "max", "ultra"] as const;
const STATUSES = ["active", "suspended"] as const;

function planBadgeColor(plan: string): string {
  switch (plan) {
    case "ultra":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "max":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "pro":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function statusDotColor(status: string): string {
  return status === "active"
    ? "bg-emerald-500"
    : "bg-red-500";
}

// ─── Component ────────────────────────────────────────────────

export default function AdminUserDetailPage() {
  const params = useParams<{ uid: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const uid = params.uid;

  // Dialogs
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  // Recharge form
  const [rechargeType, setRechargeType] = useState<"tokens" | "days">("tokens");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeRemark, setRechargeRemark] = useState("");

  // Plan form
  const [selectedPlan, setSelectedPlan] = useState("");
  const [planDays, setPlanDays] = useState("");

  // Fetch user
  const {
    data: user,
    isLoading,
    error,
  } = useQuery<AdminUserDetail>({
    queryKey: ["admin", "user", uid],
    queryFn: () => adminApi.userDetail(uid),
    enabled: !!uid,
  });

  // Mutations
  const rechargeMut = useMutation({
    mutationFn: (vars: { type: "tokens" | "days"; amount: number; remark?: string }) =>
      adminApi.recharge(uid, vars.type, vars.amount, vars.remark),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", uid] });
      setRechargeOpen(false);
      setRechargeAmount("");
      setRechargeRemark("");
    },
  });

  const changePlanMut = useMutation({
    mutationFn: (vars: { plan: string; days?: number }) =>
      adminApi.changePlan(uid, vars.plan, vars.days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", uid] });
      setPlanOpen(false);
      setPlanDays("");
    },
  });

  const changeStatusMut = useMutation({
    mutationFn: (status: string) => adminApi.changeStatus(uid, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "user", uid] }),
  });

  const forceLogoutMut = useMutation({
    mutationFn: () => adminApi.forceLogout(uid),
  });

  // ── Handlers ──
  const handleRecharge = () => {
    const amount = Number(rechargeAmount);
    if (!amount || amount <= 0) return;
    rechargeMut.mutate({ type: rechargeType, amount, remark: rechargeRemark || undefined });
  };

  const handleChangePlan = () => {
    if (!selectedPlan) return;
    const days = planDays ? Number(planDays) : undefined;
    changePlanMut.mutate({ plan: selectedPlan, days });
  };

  // ── Loading / Error ──
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <PageHeader onBack={() => router.push("/admin")} t={t} />
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            {t("admin.userDetail.loading")}
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <PageHeader onBack={() => router.push("/admin")} t={t} />
          <div className="rounded-xl border bg-card p-4 text-center text-sm text-destructive">
            {t("admin.userDetail.loadFailed")}
          </div>
        </div>
      </div>
    );
  }

  const isActive = user.status === "active";

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <PageHeader
          onBack={() => router.push("/admin")}
          title={user.username || user.email}
          subtitle={user.email}
          t={t}
        />

        {/* ── Basic Info ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <SectionHeader icon={<User className="w-4 h-4" />} title={t("admin.userDetail.basicInfo")} />

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoField label={t("admin.userDetail.username")} value={user.username || "-"} />
            <InfoField label={t("admin.userDetail.email")} value={user.email} />
            <InfoField label={t("admin.userDetail.role")} value={user.role} />
            <div>
              <span className="text-muted-foreground">{t("admin.userDetail.status")}</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${statusDotColor(user.status)}`} />
                <span className="font-medium capitalize">{user.status}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("admin.userDetail.plan")}</span>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium capitalize ${planBadgeColor(user.plan)}`}>
                  {user.plan}
                </span>
              </div>
            </div>
            <InfoField label={t("admin.userDetail.created")} value={formatDate(user.created_at)} />
          </div>
        </section>

        {/* ── Balance & Subscription ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <SectionHeader icon={<CreditCard className="w-4 h-4" />} title={t("admin.userDetail.balanceSubscription")} />

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<Coins className="w-4 h-4" />}
              label={t("admin.userDetail.tokenBalance")}
              value={formatNumber(user.token_balance)}
              color="violet"
            />
            <StatCard
              icon={<Activity className="w-4 h-4" />}
              label={t("admin.userDetail.totalConsumed")}
              value={formatNumber(user.total_consumed)}
              color="amber"
            />
            <StatCard
              icon={<CalendarClock className="w-4 h-4" />}
              label={t("admin.userDetail.expires")}
              value={formatDate(user.plan_expires_at)}
              color="blue"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setRechargeType("tokens");
                setRechargeOpen(true);
              }}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent/50 transition-colors"
            >
              {t("admin.userDetail.recharge")}
            </button>
            <button
              onClick={() => {
                setSelectedPlan(user.plan);
                setPlanOpen(true);
              }}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent/50 transition-colors"
            >
              {t("admin.userDetail.changePlan")}
            </button>
          </div>
        </section>

        {/* ── Actions ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title={t("admin.userDetail.actions")} />

          <div className="flex gap-2">
            <button
              onClick={() => changeStatusMut.mutate(isActive ? "suspended" : "active")}
              disabled={changeStatusMut.isPending}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                isActive
                  ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                  : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
              }`}
            >
              {isActive ? (
                <><ShieldX className="w-3.5 h-3.5" /> {t("admin.userDetail.suspend")}</>
              ) : (
                <><ShieldCheck className="w-3.5 h-3.5" /> {t("admin.userDetail.activate")}</>
              )}
            </button>

            <button
              onClick={() => forceLogoutMut.mutate()}
              disabled={forceLogoutMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/50 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" /> {t("admin.userDetail.forceLogout")}
            </button>
          </div>

          {forceLogoutMut.isSuccess && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("admin.userDetail.sessionsTerminated")}</p>
          )}
          {changeStatusMut.isSuccess && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("admin.userDetail.statusUpdated")}</p>
          )}
        </section>

        {/* ── Today's Usage ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <SectionHeader icon={<Activity className="w-4 h-4" />} title={t("admin.userDetail.todayUsage")} />

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t("admin.userDetail.activeThreads")}:</span>
            <span className="font-semibold text-lg">{user.active_threads ?? 0}</span>
          </div>
        </section>
      </div>

      {/* ── Recharge Dialog ── */}
      {rechargeOpen && (
        <DialogOverlay onClose={() => setRechargeOpen(false)} title={t("admin.recharge.title")}>
          <div className="space-y-4">
            <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
              {(["tokens", "days"] as const).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setRechargeType(rt)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-all capitalize ${
                    rechargeType === rt
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rt === "tokens" ? t("admin.recharge.tokens") : t("admin.recharge.days")}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm text-muted-foreground">
                {t("admin.recharge.amount")} {rechargeType === "tokens" ? `(${t("admin.recharge.tokens").toLowerCase()})` : `(${t("admin.recharge.days").toLowerCase()})`}
              </label>
              <input
                type="number"
                min={1}
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder={rechargeType === "tokens" ? "e.g. 100000" : "e.g. 30"}
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground">{t("admin.recharge.remark")}</label>
              <input
                type="text"
                value={rechargeRemark}
                onChange={(e) => setRechargeRemark(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder={t("admin.userDetail.remarkPlaceholder")}
              />
            </div>

            {rechargeMut.isError && (
              <p className="text-xs text-destructive">{t("admin.userDetail.rechargeFailed")}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRechargeOpen(false)}
                className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent/50 transition-colors"
              >
                {t("admin.userDetail.cancel")}
              </button>
              <button
                onClick={handleRecharge}
                disabled={rechargeMut.isPending || !rechargeAmount || Number(rechargeAmount) <= 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {rechargeMut.isPending ? t("admin.userDetail.processing") : t("admin.userDetail.confirm")}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* ── Change Plan Dialog ── */}
      {planOpen && (
        <DialogOverlay onClose={() => setPlanOpen(false)} title={t("admin.changePlan.title")}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPlan(p)}
                  className={`px-3 py-2 text-sm rounded-lg border capitalize transition-colors ${
                    selectedPlan === p
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm text-muted-foreground">{t("admin.userDetail.duration")}</label>
              <input
                type="number"
                min={1}
                value={planDays}
                onChange={(e) => setPlanDays(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder={t("admin.userDetail.durationPlaceholder")}
              />
            </div>

            {changePlanMut.isError && (
              <p className="text-xs text-destructive">{t("admin.userDetail.changePlanFailed")}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPlanOpen(false)}
                className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent/50 transition-colors"
              >
                {t("admin.userDetail.cancel")}
              </button>
              <button
                onClick={handleChangePlan}
                disabled={changePlanMut.isPending || !selectedPlan}
                className="px-3 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {changePlanMut.isPending ? t("admin.userDetail.saving") : t("admin.userDetail.confirm")}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function PageHeader({
  onBack,
  title,
  subtitle,
  t,
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-2 rounded-lg hover:bg-accent/50 transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title || t("admin.userDetail.title")}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      {icon}
      {title}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "violet" | "amber" | "blue";
}) {
  const gradients = {
    violet: "from-violet-600 to-indigo-600",
    amber: "from-amber-500 to-orange-500",
    blue: "from-blue-500 to-cyan-500",
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br ${gradients[color]}`}>
          <span className="text-white">{icon}</span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function DialogOverlay({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-card rounded-xl border shadow-xl max-w-md w-full p-6 space-y-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
