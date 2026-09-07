"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  Bot,
  Building2,
  ChevronRight,
  ClipboardCheck,
  QrCode,
  Users
} from "lucide-react";
import {
  getAdminAiUsage,
  getAdminCompliance,
  getAdminNotifications,
  getAdminPilotMetrics,
  getAdminRevenue,
  getAdminUsage
} from "@/lib/ascendApi";
import { DelightBadge, DelightEmptyState } from "@/components/Delight";
import { AscendHeroPanel, BusinessSigil } from "@/components/AscendVisualIdentity";
import { DashboardHeroSkeleton, SectionShell, SkeletonCardList, SkeletonStatGrid } from "@/components/PerceivedLoading";
import { messages } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Revenue = Awaited<ReturnType<typeof getAdminRevenue>>;
type RevenueGym = Revenue["byGym"][number];
type RevenueTrainer = Revenue["byTrainer"][number];
type UsageRow = Awaited<ReturnType<typeof getAdminUsage>>["usage"][number];
type ComplianceRow = Awaited<ReturnType<typeof getAdminCompliance>>["compliance"][number];
type AiUsage = Awaited<ReturnType<typeof getAdminAiUsage>>;
type PilotMetrics = Awaited<ReturnType<typeof getAdminPilotMetrics>>;
type AdminNotifications = Awaited<ReturnType<typeof getAdminNotifications>>;
type Notification = AdminNotifications["notifications"][number];
type Translate = (key: string, values?: Record<string, string | number>) => string;

function english(key: string, values?: Record<string, string | number>) {
  let value = messages.en[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function asNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

function formatCurrency(cents: string | number | null | undefined, currency = "MYR") {
  try {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0
    }).format(asNumber(cents) / 100);
  } catch {
    return `${currency.toUpperCase()} ${(asNumber(cents) / 100).toLocaleString("en-MY")}`;
  }
}

export function summarizeCurrentPlanValue(rows: RevenueGym[], t: Translate = english) {
  const currencies = new Set(rows.flatMap((row) => asNumber(row.currency_count) > 1 ? ["mixed"] : [row.currency || "MYR"]));
  const subscriptions = rows.reduce((total, row) => total + asNumber(row.active_subscriptions), 0);
  if (currencies.size !== 1 || currencies.has("mixed")) {
    return {
      value: `${subscriptions} active`,
      detail: t("admin.multipleCurrenciesDetail")
    };
  }
  const currency = [...currencies][0] ?? "MYR";
  const cents = rows.reduce((total, row) => total + asNumber(row.active_plan_value_cents), 0);
  return {
    value: formatCurrency(cents, currency),
    detail: t("admin.currentPaidAccessPeriods", { count: subscriptions })
  };
}

export function uniquePriorities(notifications: Notification[]) {
  const seen = new Set<string>();
  return [...notifications]
    .sort((left, right) => {
      const severity = { critical: 0, important: 1 } as const;
      return severity[left.severity] - severity[right.severity] || right.count - left.count;
    })
    .filter((item) => {
      const key = `${item.type}:${item.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function percentage(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function ProgressRow({ label, value, percentageValue }: { label: string; value: string; percentageValue: number }) {
  const safeValue = Math.max(0, Math.min(100, percentageValue));
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="font-semibold text-white">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)}>
        <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail, tone = "plain" }: { label: string; value: string; detail: string; tone?: "plain" | "warning" | "positive" }) {
  const toneClass = tone === "warning" ? "text-amber" : tone === "positive" ? "text-lime" : "text-white";
  return (
    <article className="ascend-workspace-stat p-4">
      <p className="text-xs font-semibold uppercase text-zinc-400">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{detail}</p>
    </article>
  );
}

export function AdminDashboardClient() {
  const { t } = useI18n();
  const [revenue, setRevenue] = useState<Revenue>({ byGym: [], byTrainer: [] });
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [pilotMetrics, setPilotMetrics] = useState<PilotMetrics | null>(null);
  const [notifications, setNotifications] = useState<AdminNotifications | null>(null);
  const [loadFailures, setLoadFailures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const failures: string[] = [];
    const recordFailure = (label: string) => () => failures.push(label);

    async function load() {
      await Promise.allSettled([
        getAdminRevenue().then((value) => mounted && setRevenue({ byGym: safeArray(value.byGym), byTrainer: safeArray(value.byTrainer) })).catch(recordFailure(t("admin.subscriptionValues"))),
        getAdminUsage().then((value) => mounted && setUsage(safeArray(value.usage))).catch(recordFailure(t("admin.clubActivity"))),
        getAdminCompliance().then((value) => mounted && setCompliance(safeArray(value.compliance))).catch(recordFailure(t("admin.memberMomentum"))),
        getAdminAiUsage().then((value) => mounted && setAiUsage(value)).catch(recordFailure(t("admin.aiOperations"))),
        getAdminPilotMetrics().then((value) => mounted && setPilotMetrics(value)).catch(recordFailure(t("admin.businessSummary"))),
        getAdminNotifications().then((value) => mounted && setNotifications(value)).catch(recordFailure(t("admin.ownerPriorities")))
      ]);
      if (mounted) {
        setLoadFailures(failures);
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [t]);

  const byGym = safeArray(revenue.byGym);
  const byTrainer = safeArray(revenue.byTrainer);
  const priorities = useMemo(() => uniquePriorities(safeArray(notifications?.notifications)), [notifications]);
  const planValue = summarizeCurrentPlanValue(byGym, t);
  const totalClients = pilotMetrics?.clients.totalClients ?? usage.reduce((total, row) => total + asNumber(row.clients), 0);
  const weeklyActive = pilotMetrics?.clients.weeklyActiveUsers ?? usage.reduce((total, row) => total + asNumber(row.weekly_active_clients), 0);
  const clientsMonitored = pilotMetrics?.trainers.clientsMonitored ?? usage.reduce((total, row) => total + asNumber(row.assigned_clients), 0);
  const clientsContacted = pilotMetrics?.trainers.clientsContacted7d ?? usage.reduce((total, row) => total + asNumber(row.clients_contacted_7d), 0);
  const followUpCoverage = pilotMetrics?.trainers.followUpCoverageRate ?? (clientsMonitored ? Math.round((clientsContacted / clientsMonitored) * 100) : 0);
  const outstandingFollowUps = pilotMetrics?.trainers.outstandingFollowUps ?? 0;
  const freeCandidates = pilotMetrics?.business.freeUsers ?? 0;
  const premiumCandidates = pilotMetrics?.business.premiumReviewCandidates ?? 0;
  const unassignedClients = pilotMetrics?.trainers.unassignedClients ?? 0;
  const pendingTrainers = pilotMetrics?.trainers.pendingTrainers ?? 0;
  const criticalCount = notifications?.summary.critical ?? 0;
  const heroStatus = loadFailures.length ? "watch" : criticalCount ? "attention" : priorities.length ? "watch" : "good";
  const heroStatusLabel = heroStatus === "good" ? t("admin.good") : heroStatus === "watch" ? t("trainer.watch") : t("client360.needsAttention");
  const heroBrief = loadFailures.length
    ? t("admin.partialDataBrief", { failures: loadFailures.join(", ") })
    : criticalCount
      ? t("admin.urgentItemsBrief", { count: criticalCount })
      : outstandingFollowUps
        ? t("admin.outstandingFollowupsBrief", { followups: outstandingFollowUps, active: weeklyActive, total: totalClients })
        : t("admin.noUrgentBrief", { active: weeklyActive, total: totalClients, contacted: clientsContacted });

  const clubRows = useMemo(() => {
    const gymIds = new Set([...usage.map((row) => row.gym_id), ...byGym.map((row) => row.id)]);
    return [...gymIds].map((gymId) => {
      const activity = usage.find((row) => row.gym_id === gymId);
      const subscriptions = byGym.find((row) => row.id === gymId);
      const momentum = compliance.find((row) => row.gym_id === gymId);
      const clients = asNumber(activity?.clients);
      const active = asNumber(activity?.weekly_active_clients);
      const assigned = asNumber(activity?.assigned_clients);
      const contacted = asNumber(activity?.clients_contacted_7d);
      const lowMomentum = asNumber(momentum?.low_compliance_clients);
      const currencyCount = asNumber(subscriptions?.currency_count);
      const planValueText = currencyCount > 1 ? "Multiple currencies" : formatCurrency(subscriptions?.active_plan_value_cents, subscriptions?.currency || "MYR");
      const recommendation = lowMomentum > 0
        ? `Ask trainers to contact ${lowMomentum} low-momentum ${lowMomentum === 1 ? "member" : "members"}.`
        : assigned > contacted
          ? `${assigned - contacted} assigned ${assigned - contacted === 1 ? "member has" : "members have"} not received a trainer message this week.`
          : clients && !active
            ? "Member activity is quiet this week; review the client list."
            : "No immediate club action is indicated by the available data.";
      return {
        id: gymId,
        name: activity?.gym_name || subscriptions?.gym_name || "Club",
        clients,
        active,
        assigned,
        contacted,
        lowMomentum,
        activeSubscriptions: asNumber(subscriptions?.active_subscriptions),
        planValueText,
        recommendation
      };
    }).sort((left, right) => right.lowMomentum - left.lowMomentum || left.name.localeCompare(right.name));
  }, [byGym, compliance, usage]);

  const trainerRows = useMemo(() => [...byTrainer].sort((left, right) => {
    const leftGap = asNumber(left.clients_assigned) - asNumber(left.clients_contacted_7d);
    const rightGap = asNumber(right.clients_assigned) - asNumber(right.clients_contacted_7d);
    return rightGap - leftGap || asNumber(right.open_risk_alerts) - asNumber(left.open_risk_alerts);
  }), [byTrainer]);

  if (loading) {
    return (
      <>
        <DashboardHeroSkeleton bodyLines={2} />
        <SectionShell title={t("admin.todaysBusinessPicture")}><SkeletonStatGrid count={4} /></SectionShell>
        <SectionShell title={t("trainer.todaysPriorities")}><SkeletonCardList count={3} compact /></SectionShell>
      </>
    );
  }

  return (
    <>
      <AscendHeroPanel eyebrow={t("admin.todaysBusinessBrief")} title={t("admin.ownerCommandCenter")} body={heroBrief} tone="owner" visual={<BusinessSigil status={heroStatusLabel} />}>
        <div className="mt-3">
          <DelightBadge tone={heroStatus === "good" ? "teal" : "amber"}>
            {heroStatus === "good" ? t("admin.noUrgentOwnerActions") : heroStatus === "watch" ? t("admin.reviewTodaysSignals") : t("admin.startUrgentItem")}
          </DelightBadge>
        </div>
      </AscendHeroPanel>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("admin.todaysBusinessPicture")}</h2>
          {pilotMetrics?.generatedAt ? <time className="text-xs text-zinc-500" dateTime={pilotMetrics.generatedAt}>{t("admin.updatedAt", { time: new Date(pilotMetrics.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}</time> : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label={t("admin.currentPlanValue")} value={planValue.value} detail={planValue.detail} />
          <SummaryCard label={t("admin.membersActiveThisWeek")} value={`${weeklyActive} / ${totalClients}`} detail={t("admin.activeClients7dDetail")} tone={weeklyActive > 0 ? "positive" : "plain"} />
          <SummaryCard label={t("admin.trainerFollowup")} value={`${clientsContacted} / ${clientsMonitored}`} detail={t("admin.followupCoverageDetail", { percentage: percentage(followUpCoverage) })} tone={followUpCoverage >= 70 ? "positive" : clientsMonitored ? "warning" : "plain"} />
          <SummaryCard label={t("admin.outstandingFollowups")} value={String(outstandingFollowUps)} detail={t("admin.openRiskAlertsDetail")} tone={outstandingFollowUps ? "warning" : "positive"} />
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Bell className="text-calm" size={20} /><h2 className="text-xl font-semibold">{t("trainer.todaysPriorities")}</h2></div>
          <span className="text-sm text-zinc-400">{t("admin.openCount", { count: notifications?.summary.total ?? priorities.length })}</span>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          {priorities.length ? priorities.map((priority) => (
            <article key={`${priority.type}:${priority.href}`} className={`rounded-xl border p-4 ${priority.severity === "critical" ? "border-red-400/40 bg-red-500/10" : "border-amber/40 bg-amber/10"}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={priority.severity === "critical" ? "mt-0.5 shrink-0 text-red-300" : "mt-0.5 shrink-0 text-amber"} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3"><p className="font-semibold">{priority.title}</p><span className="rounded-full bg-ink px-2 py-0.5 text-xs text-zinc-300">{priority.count}</span></div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{priority.body}</p>
                  <Link href={priority.href} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white">{t("admin.takeAction")} <ChevronRight size={17} /></Link>
                </div>
              </div>
            </article>
          )) : (
            <div className="xl:col-span-3"><DelightEmptyState tone="teal" title={t("admin.nothingUrgent")} body={t("admin.prioritiesEmptyDetail")} /></div>
          )}
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center gap-2"><ClipboardCheck className="text-lime" size={20} /><h2 className="text-xl font-semibold">{t("admin.reviewCandidates")}</h2></div>
        <p className="mt-1 text-sm text-zinc-400">{t("admin.reviewCandidatesDetail")}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label={t("admin.freePlanMembers")} value={String(freeCandidates)} detail={t("admin.freePlanMembersDetail")} />
          <SummaryCard label={t("admin.athleteReview")} value={String(premiumCandidates)} detail={t("admin.athleteReviewDetail")} />
          <SummaryCard label={t("admin.trainerAssignment")} value={String(unassignedClients)} detail={t("admin.trainerAssignmentDetail")} tone={unassignedClients ? "warning" : "positive"} />
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center gap-2"><Building2 className="text-lime" size={20} /><h2 className="text-xl font-semibold">{t("admin.clubPerformance")}</h2></div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {clubRows.length ? clubRows.map((club) => (
            <article key={club.id} className="ascend-workspace-stat p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{club.name}</p><p className="mt-1 text-sm text-zinc-400">{t("admin.clubPlanValueLine", { count: club.activeSubscriptions, value: club.planValueText })}</p></div>
                {club.lowMomentum ? <span className="rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold text-amber">{t("trainer.watch")}</span> : <span className="rounded-full border border-calm/40 bg-calm/10 px-3 py-1 text-xs font-semibold text-calm">{t("admin.steady")}</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-zinc-500">{t("trainer.active")}</p><p className="mt-1 font-semibold">{club.active}/{club.clients}</p></div>
                <div><p className="text-zinc-500">{t("admin.contacted")}</p><p className="mt-1 font-semibold">{club.contacted}/{club.assigned}</p></div>
                <div><p className="text-zinc-500">{t("admin.lowMomentum")}</p><p className="mt-1 font-semibold">{club.lowMomentum}</p></div>
                <div><p className="text-zinc-500">{t("admin.paidAccess")}</p><p className="mt-1 font-semibold">{club.activeSubscriptions}</p></div>
              </div>
              <p className="mt-4 border-t border-white/10 pt-3 text-sm leading-6 text-zinc-300"><span className="font-semibold text-white">{t("admin.recommendedAction")}</span> {club.recommendation}</p>
            </article>
          )) : <div className="xl:col-span-2"><DelightEmptyState tone="teal" title={t("admin.noClubActivity")} body={t("admin.clubActivityEmpty")} /></div>}
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="text-calm" size={20} /><h2 className="text-xl font-semibold">{t("admin.trainerFollowup")}</h2></div>{pendingTrainers ? <Link href="/admin/users" className="text-sm font-semibold text-amber">{t("admin.pendingApprovalCount", { count: pendingTrainers })}</Link> : null}</div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {trainerRows.length ? trainerRows.map((trainer: RevenueTrainer) => {
            const assigned = asNumber(trainer.clients_assigned);
            const contacted = asNumber(trainer.clients_contacted_7d);
            const gap = Math.max(0, assigned - contacted);
            return (
              <article key={trainer.id} className="ascend-workspace-stat p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{trainer.trainer_name || t("common.trainer")}</p><p className="mt-1 text-sm text-zinc-400">{trainer.gym_name}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${gap || asNumber(trainer.open_risk_alerts) ? "border-amber/40 bg-amber/10 text-amber" : "border-calm/40 bg-calm/10 text-calm"}`}>{gap || asNumber(trainer.open_risk_alerts) ? t("admin.followUp") : t("trainer.onTrack")}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-zinc-500">{t("admin.clientsReached")}</p><p className="mt-1 font-semibold">{contacted}/{assigned}</p></div><div><p className="text-zinc-500">{t("admin.weeklyReviews")}</p><p className="mt-1 font-semibold">{asNumber(trainer.weekly_reviews_7d)}</p></div><div><p className="text-zinc-500">{t("admin.openAlerts")}</p><p className="mt-1 font-semibold">{asNumber(trainer.open_risk_alerts)}</p></div></div>
                <p className="mt-4 text-sm text-zinc-300">{gap ? t("admin.assignedClientsNotMessaged", { count: gap }) : assigned ? t("admin.allAssignedMessaged") : t("admin.noActiveClientsAssigned")}</p>
              </article>
            );
          }) : <div className="xl:col-span-2"><DelightEmptyState tone="purple" title={t("admin.noActiveTrainers")} body={t("admin.activeTrainersEmpty")} /></div>}
        </div>
      </section>

      <section className="ascend-workspace-section mt-5 p-4 sm:p-5">
        <h2 className="text-xl font-semibold">{t("admin.memberEngagement")}</h2>
        <p className="mt-1 text-sm text-zinc-400">{t("admin.memberEngagementDetail")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProgressRow label={t("admin.membersActiveThisWeek")} value={`${weeklyActive}/${totalClients}`} percentageValue={totalClients ? (weeklyActive / totalClients) * 100 : 0} />
          <ProgressRow label={t("admin.foodLogging")} value={percentage(pilotMetrics?.clients.foodLoggingRate ?? 0)} percentageValue={pilotMetrics?.clients.foodLoggingRate ?? 0} />
          <ProgressRow label={t("admin.workoutLogging")} value={percentage(pilotMetrics?.clients.workoutLoggingRate ?? 0)} percentageValue={pilotMetrics?.clients.workoutLoggingRate ?? 0} />
          <ProgressRow label={t("admin.bodyScanAdoption")} value={pilotMetrics?.clients.athleteClients ? t("admin.athleteMembersCount", { scans: pilotMetrics.clients.bodyScanUsers90d, athletes: pilotMetrics.clients.athleteClients }) : t("admin.noAthleteMembers")} percentageValue={pilotMetrics?.clients.bodyScanAdoptionRate ?? 0} />
        </div>
      </section>

      <details id="ai-business-monitor" className="ascend-workspace-section mt-5 p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span className="flex items-center gap-2"><Bot className="text-calm" size={20} /><span className="font-semibold">AI Operations</span></span><span className="text-sm text-zinc-400">{aiUsage ? "Technical details" : "Unavailable"}</span></summary>
        {aiUsage ? <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-ink p-3"><p className="text-zinc-400">Projected spend</p><p className="mt-1 text-lg font-semibold">{formatCurrency(aiUsage.summary.projected_monthly_cost_cents)}</p></div><div className="rounded-xl bg-ink p-3"><p className="text-zinc-400">Recorded failures</p><p className="mt-1 text-lg font-semibold">{asNumber(aiUsage.summary.monthly_errors)}</p></div></div> : <p className="mt-3 text-sm text-zinc-300">AI operation data could not be loaded. Other owner tools remain available.</p>}
      </details>

      <nav aria-label="Owner tools" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/admin/users" className="ascend-pressable ascend-workspace-action flex min-h-16 items-center gap-3 p-4"><Users className="text-lime" size={20} /><span className="font-medium">Users and assignments</span></Link>
        <Link href="/admin/subscriptions" className="ascend-pressable ascend-workspace-action flex min-h-16 items-center gap-3 p-4"><BadgeDollarSign className="text-calm" size={20} /><span className="font-medium">Subscriptions</span></Link>
        <Link href="/admin/referrals" className="ascend-pressable ascend-workspace-action flex min-h-16 items-center gap-3 p-4"><QrCode className="text-lime" size={20} /><span className="font-medium">Referral codes</span></Link>
      </nav>
    </>
  );
}
