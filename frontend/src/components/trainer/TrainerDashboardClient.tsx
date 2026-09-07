"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateNutritionTargets } from "@ascend/shared";
import { AlertTriangle, Check, MessageSquare, Search, TrendingUp } from "lucide-react";
import { getMe, getTrainerClients, getTrainerRiskAlerts, sendTrainerClientPraise, updateTrainerRiskAlert } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { DelightEmptyState } from "@/components/Delight";
import { AscendHeroPanel, PrioritySigil } from "@/components/AscendVisualIdentity";
import { buildAthleteCoachInsights, daysSince } from "@/lib/coachIntelligence";
import { DashboardHeroSkeleton, SectionShell, SkeletonCardList, SkeletonStatGrid, SkeletonText } from "@/components/PerceivedLoading";
import { messages } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/I18nProvider";

type TrainerClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
type RiskAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];
type Translate = (key: string, values?: Record<string, string | number>) => string;

function english(key: string, values?: Record<string, string | number>) {
  let value = messages.en[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function formatGoal(goal: string | null | undefined, t: Translate = english) {
  if (goal === "fat_loss") return t("onboarding.goalFatLoss");
  if (goal === "muscle_gain") return t("onboarding.goalMuscleGain");
  if (goal === "maintenance") return t("onboarding.goalMaintenance");
  return t("dashboard.goalNotSet");
}

function riskTier(client: TrainerClient): "high" | "watch" | "on_track" | "none" {
  if (client.risk_severity === "high") return "high";
  if (client.risk_severity) return "watch";
  if (client.compliance_score === null || client.compliance_score === undefined) return "none";
  const score = Number(client.compliance_score);
  if (score < 50) return "high";
  if (score < 70) return "watch";
  return "on_track";
}

export function riskLabel(client: TrainerClient, t: Translate = english) {
  const tier = riskTier(client);
  if (tier === "high") return t("trainer.highRisk");
  if (tier === "watch") return t("trainer.watch");
  if (tier === "none") return t("trainer.noScore");
  return t("trainer.onTrack");
}

function riskClass(client: TrainerClient) {
  const tier = riskTier(client);
  if (tier === "high") return "bg-amber text-ink";
  if (tier === "watch") return "bg-calm text-ink";
  return "bg-lime text-ink";
}

function daysAgo(value: string | null | undefined, t: Translate = english) {
  if (!value) return t("trainer.noCheckinYet");
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return t("trainer.noCheckinYet");
  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("client360.today");
  if (days === 1) return t("client360.yesterday");
  return t("client360.daysAgo", { days });
}

function isRecent(value?: string | null, days = 7) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function nutritionSummary(client: TrainerClient, t: Translate = english) {
  const calories = asNumber(client.calories_today);
  if (!calories) return t("trainer.noFoodLogged");

  const targets = calculateNutritionTargets({
    goalType: client.goal_type,
    sex: client.gender === "female" || client.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client.age_years,
    heightCm: client.height_cm,
    weightKg: client.latest_weight_kg ?? client.starting_weight_kg,
    targetWeightKg: client.target_weight_kg,
    activityLevel:
      client.activity_level === "low" || client.activity_level === "moderate" || client.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  });
  const labels: string[] = [];
  if (calories > targets.calorieTarget * 1.08) labels.push(t("trainer.overCalories"));
  if (asNumber(client.protein_g_today) < targets.proteinTargetG * 0.55 && calories > targets.calorieTarget * 0.35) labels.push(t("trainer.lowProtein"));
  if (asNumber(client.fat_g_today) > targets.fatTargetG * 0.75) labels.push(t("trainer.highFat"));
  if (asNumber(client.carbs_g_today) > targets.carbsTargetG * 0.8) labels.push(t("trainer.highCarbs"));
  return labels.length ? labels.slice(0, 2).join(", ") : t("trainer.onTrack");
}

function nutritionSummaryClass(client: TrainerClient) {
  const calories = asNumber(client.calories_today);
  if (!calories) return "text-zinc-500";
  const summary = nutritionSummary(client);
  if (summary === english("trainer.onTrack")) return "text-lime";
  return "text-amber";
}

type PriorityCard = {
  client: TrainerClient;
  badge: "premium" | "athlete";
  reason: string;
  action: string;
  lastActivity: string;
  score: number;
  alertId?: string;
};

function maxDate(...values: Array<string | null | undefined>) {
  const times = values.map((value) => (value ? new Date(value).getTime() : 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function membershipBadge(client: TrainerClient): "premium" | "athlete" | null {
  if (client.athlete_mode_enabled) return "athlete";
  return client.current_plan === "premium" || client.current_plan === "trainer_pro" ? "premium" : null;
}

export function lastActivityFor(client: TrainerClient) {
  return client.last_activity_at ?? maxDate(client.last_food_logged_at, client.last_weight_logged_at, client.last_water_logged_at, client.last_client_message_at);
}

function premiumNeedsAttention(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 100);
  const lastFood = daysSince(client.last_food_logged_at);
  const lastWater = daysSince(client.last_water_logged_at);
  const lastWeight = daysSince(client.last_weight_logged_at);
  const openAlerts = Number(client.open_alerts ?? 0);

  if (client.risk_severity === "high" || score < 50 || openAlerts > 0) {
    return { reasonKey: "trainer.momentumNeedsAttention", actionKey: "trainer.sendSupportiveCheckin", score: 95 };
  }
  if (lastFood === null || lastFood >= 5) {
    return { reasonKey: "trainer.noFoodLogsFiveDays", actionKey: "trainer.askLoggingHarder", score: 85 };
  }
  if (lastWeight !== null && lastWeight >= 10) {
    return { reasonKey: "trainer.weightUpdateOverdue", actionKey: "trainer.askWeightCheckin", score: 70 };
  }
  if (lastWater !== null && lastWater >= 5) {
    return { reasonKey: "trainer.waterTrackingDropped", actionKey: "trainer.promptWaterTarget", score: 60 };
  }
  return null;
}

function premiumGreatProgress(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 0);
  const streak = Number(client.consistency_streak ?? 0);
  const nutrition = nutritionSummary(client);

  if (client.goal_achieved_at) return { reasonKey: "dashboard.goalAchieved", actionKey: "trainer.celebrateMaintenance", score: 100 };
  if (streak >= 5) return { reasonKey: "trainer.consistencyStreak", reasonValues: { days: streak }, actionKey: "trainer.sendPraiseHabit", score: 80 };
  if (score >= 80 && nutrition === english("trainer.onTrack")) return { reasonKey: "trainer.consistentNutritionMomentum", actionKey: "trainer.keepPlanSteady", score: 70 };
  return null;
}

export function trainerPriorityCards(clients: TrainerClient[], alerts: RiskAlert[] = [], t: Translate = english) {
  const eligible = clients.filter((client) => membershipBadge(client));
  const needsAttention: PriorityCard[] = [];
  const greatProgress: PriorityCard[] = [];
  const alertByClient = new Map<string, RiskAlert>();
  for (const alert of alerts) {
    if (!alertByClient.has(alert.user_id)) alertByClient.set(alert.user_id, alert);
  }

  for (const client of eligible) {
    const badge = membershipBadge(client)!;
    const athleteInsight = client.athlete_mode_enabled
      ? buildAthleteCoachInsights({
          athlete: {
            profile: {
              user_id: client.id,
              enabled: true,
              goal_weight_kg: client.target_weight_kg,
              current_weight_kg: client.latest_weight_kg ?? client.starting_weight_kg
            }
          },
          summary: client.body_composition_summary ?? null
        })[0]
      : null;
    const premiumAttention = premiumNeedsAttention(client);
    const premiumProgress = premiumGreatProgress(client);
    const lastActivity = daysAgo(lastActivityFor(client), t);
    const riskAlert = alertByClient.get(client.id);

    if (riskAlert) {
      needsAttention.push({
        client,
        badge,
        reason: riskAlert.message,
        action: riskAlert.severity === "high" ? t("trainer.reviewSignalToday") : t("trainer.reviewSignalNextTouchpoint"),
        lastActivity,
        score: riskAlert.severity === "high" ? 120 : riskAlert.severity === "medium" ? 100 : 80,
        alertId: riskAlert.id
      });
      continue;
    }

    if (athleteInsight && ["red", "orange", "yellow"].includes(athleteInsight.tone)) {
      needsAttention.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumAttention) {
      needsAttention.push({ client, badge, reason: t(premiumAttention.reasonKey), action: t(premiumAttention.actionKey), lastActivity, score: premiumAttention.score });
      continue;
    }
    if (athleteInsight && ["green", "blue"].includes(athleteInsight.tone)) {
      greatProgress.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumProgress) {
      greatProgress.push({
        client,
        badge,
        reason: t(premiumProgress.reasonKey, premiumProgress.reasonValues),
        action: t(premiumProgress.actionKey),
        lastActivity,
        score: premiumProgress.score
      });
    }
  }

  return {
    eligible,
    needsAttention: needsAttention.sort((a, b) => b.score - a.score),
    greatProgress: greatProgress.sort((a, b) => b.score - a.score)
  };
}

function weeklyClientSummary(clients: TrainerClient[], priorities = trainerPriorityCards(clients)) {
  const athleteClients = clients.filter((client) => client.athlete_mode_enabled);
  const bodyScansDue = athleteClients.filter((client) => {
    const latestScanDate = client.body_composition_summary?.latestScan?.scanDate ?? null;
    const age = daysSince(latestScanDate);
    return age === null || age > 28;
  }).length;
  const checkInsDue = priorities.needsAttention.filter((item) => item.reason.includes("No food") || item.reason.includes("Momentum") || item.reason.includes("Water")).length;
  const plateaued = priorities.needsAttention.filter((item) => item.reason.toLowerCase().includes("plateau")).length;
  const goalAchievements = clients.filter((client) => client.goal_achieved_at).length;

  return {
    improving: priorities.greatProgress.length,
    plateaued,
    atRisk: priorities.needsAttention.length,
    checkInsDue,
    bodyScansDue,
    goalAchievements
  };
}

export function countActiveToday(clients: TrainerClient[]) {
  return clients.filter((client) => client.active_today === true).length;
}

export function countHighRiskClients(clients: TrainerClient[], alerts: RiskAlert[]) {
  const eligibleIds = new Set(clients.filter((client) => membershipBadge(client)).map((client) => client.id));
  const clientIds = new Set(clients.filter((client) => eligibleIds.has(client.id) && riskTier(client) === "high").map((client) => client.id));
  alerts.filter((alert) => alert.severity === "high" && eligibleIds.has(alert.user_id)).forEach((alert) => clientIds.add(alert.user_id));
  return clientIds.size;
}

function PriorityClientCard({
  item,
  type,
  onResolve,
  resolving
}: {
  item: PriorityCard;
  type: "attention" | "progress";
  onResolve?: (item: PriorityCard) => void;
  resolving?: boolean;
}) {
  const { t } = useI18n();
  const border = type === "attention" ? "border-line border-l-4 border-l-amber bg-ink/55" : "border-line border-l-4 border-l-lime bg-ink/55";
  const badgeClass = item.badge === "athlete" ? "border-purple-400/50 bg-purple-400/10 text-purple-100" : "border-teal-400/50 bg-teal-400/10 text-teal-100";
  const badgeLabel = item.badge === "athlete" ? t("trainer.athlete") : t("common.premium");
  return (
    <article className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <ProfileAvatar src={item.client.profile_photo_url} name={item.client.full_name} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{item.client.full_name}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>{badgeLabel}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{item.reason}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">{t("trainer.suggestedAction", { action: item.action })}</p>
            <p className="mt-1 text-xs text-zinc-500">{t("trainer.lastActivity", { date: item.lastActivity })}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/trainer/clients/${item.client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold">
          {t("trainer.view")}
        </Link>
        <Link href={`/messages?userId=${item.client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink">
          {t("common.messages")}
        </Link>
        {item.alertId && onResolve ? (
          <button
            type="button"
            disabled={resolving}
            onClick={() => onResolve(item)}
            className="ascend-pressable col-span-2 flex h-11 items-center justify-center gap-1 rounded-xl border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
          >
            <Check size={15} /> {t("trainer.handled")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function TrainerDashboardClient() {
  const { t } = useI18n();
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [status, setStatus] = useState(t("trainer.loadingAssignedClients"));
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [praisingClientId, setPraisingClientId] = useState("");
  const [resolvingAlertId, setResolvingAlertId] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | "attention" | "unread" | "on_track">("all");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getMe();
        if (isMounted) setTrainerName(profile.user.full_name || profile.user.email || t("common.coach"));
        const isTrainerOnly = profile.roles.includes("trainer") && !profile.roles.some((role) => role === "owner" || role === "admin");
        if (isTrainerOnly && profile.user.trainer_status && profile.user.trainer_status !== "active") {
          if (!isMounted) return;
          setIsPendingApproval(true);
          setStatus("");
          return;
        }

        const [clientResponse, alertResponse] = await Promise.all([
          getTrainerClients(),
          getTrainerRiskAlerts().catch(() => null)
        ]);
        if (!isMounted) return;
        setClients(clientResponse.clients);
        setStatus("");

        if (alertResponse) {
          setAlerts(alertResponse.alerts);
        }
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : t("trainer.dashboardLoadError"));
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [t]);

  const activeToday = useMemo(() => countActiveToday(clients), [clients]);
  const highRisk = useMemo(() => countHighRiskClients(clients, alerts), [alerts, clients]);
  const averageScore = useMemo(() => {
    const scored = clients.map((client) => Number(client.compliance_score)).filter((score) => Number.isFinite(score));
    if (!scored.length) return "--";
    return String(Math.round(scored.reduce((total, score) => total + score, 0) / scored.length));
  }, [clients]);
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) => {
        const aRisk = riskTier(a) === "high" ? 0 : riskTier(a) === "watch" ? 1 : 2;
        const bRisk = riskTier(b) === "high" ? 0 : riskTier(b) === "watch" ? 1 : 2;
        if (aRisk !== bRisk) return aRisk - bRisk;
        return Number(a.compliance_score ?? 999) - Number(b.compliance_score ?? 999);
      }),
    [clients]
  );
  const nutritionSummaryMap = useMemo(
    () =>
      new Map(
        clients.map((client) => [client.id, nutritionSummary(client, t)])
      ),
    [clients, t]
  );
  const priorities = useMemo(() => trainerPriorityCards(clients, alerts, t), [alerts, clients, t]);
  const weeklySummary = useMemo(() => weeklyClientSummary(clients, priorities), [clients, priorities]);
  const athleteAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "athlete").length, [priorities.needsAttention]);
  const premiumAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "premium").length, [priorities.needsAttention]);
  const excellentProgress = priorities.greatProgress.length;
  const needsCheckIn = priorities.needsAttention.length;
  const unreadMessages = useMemo(() => clients.reduce((total, client) => total + Number(client.unread_messages ?? 0), 0), [clients]);
  const visibleClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    const attentionIds = new Set(priorities.needsAttention.map((item) => item.client.id));
    return sortedClients.filter((client) => {
      if (query && !`${client.full_name} ${client.email}`.toLowerCase().includes(query)) return false;
      if (clientFilter === "attention") return attentionIds.has(client.id);
      if (clientFilter === "unread") return Number(client.unread_messages ?? 0) > 0;
      if (clientFilter === "on_track") return riskTier(client) === "on_track";
      return true;
    });
  }, [clientFilter, clientSearch, priorities.needsAttention, sortedClients]);
  const isInitialLoading = !clients.length && !alerts.length && !trainerName && status === t("trainer.loadingAssignedClients");

  async function sendPraise(clientId: string, clientName: string) {
    setPraisingClientId(clientId);
    setStatus("");

    try {
      await sendTrainerClientPraise(clientId);
      setStatus(`Praise sent to ${clientName}.`);
    } catch {
      setStatus("Could not send praise yet. Make sure this client is assigned to you.");
    } finally {
      setPraisingClientId("");
    }
  }

  async function resolveAlert(item: PriorityCard) {
    if (!item.alertId) return;
    setResolvingAlertId(item.alertId);
    setStatus("");
    try {
      await updateTrainerRiskAlert(item.alertId, "resolved");
      setAlerts((current) => current.filter((alert) => alert.id !== item.alertId));
      setStatus(`${item.client.full_name}'s alert marked handled.`);
    } catch {
      setStatus("Could not update this alert yet. Please try again.");
    } finally {
      setResolvingAlertId("");
    }
  }

  if (isPendingApproval) {
    return (
      <section className="ascend-workspace-section mt-4 border-amber/40 bg-amber/10 p-4">
        <p className="text-sm font-semibold text-amber">{t("trainer.approvalPending")}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          {t("trainer.approvalPendingDetail")}
        </p>
        <Link href="/subscription" className="ascend-pressable mt-4 flex h-11 items-center justify-center rounded-xl bg-lime font-semibold text-ink">
          {t("access.viewPlans")}
        </Link>
      </section>
    );
  }

  if (isInitialLoading) {
    return (
      <>
        <DashboardHeroSkeleton bodyLines={2} />
        <section className="ascend-workspace-section mt-4 p-4">
          <SkeletonStatGrid count={4} />
          <div className="mt-4">
            <SkeletonText lines={1} />
            <div className="mt-3">
              <SkeletonCardList count={2} compact />
            </div>
          </div>
        </section>
        <SectionShell title={t("trainer.clientWorkQueue")}>
          <SkeletonCardList count={3} compact />
        </SectionShell>
        <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p>
      </>
    );
  }

  return (
    <>
      <AscendHeroPanel
        eyebrow={`${new Date().getHours() < 12 ? t("trainer.goodMorning") : new Date().getHours() < 18 ? t("trainer.goodAfternoon") : t("trainer.goodEvening")}${trainerName ? `, ${trainerName}` : ""}`}
        title={t("trainer.todaysPriorities")}
        body={t("trainer.todaysPrioritiesBody")}
        tone="trainer"
        visual={<PrioritySigil count={priorities.needsAttention.length} />}
      />

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label={t("client360.needsAttention")} value={String(needsCheckIn)} detail={t("trainer.premiumAthleteCount", { premium: premiumAttention, athlete: athleteAttention })} tone={needsCheckIn ? "warning" : "success"} />
          <MetricCard label={t("trainer.winsToCelebrate")} value={String(excellentProgress)} detail={t("trainer.praiseOpportunities")} tone="success" />
          <MetricCard label={t("trainer.activeToday")} value={String(activeToday)} detail={t("trainer.assignedClientsCount", { count: clients.length })} />
          <MetricCard label={t("trainer.unreadMessagesLabel")} value={String(unreadMessages)} detail={unreadMessages ? t("trainer.waitingForReply") : t("trainer.inboxClear")} tone={unreadMessages ? "warning" : "success"} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-amber" size={19} />
                <h2 className="text-lg font-semibold">{t("client360.needsAttention")}</h2>
              </div>
              {highRisk ? <span className="rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold text-amber">{t("trainer.highPriorityCount", { count: highRisk })}</span> : null}
            </div>
            <div className="mt-3 space-y-3">
              {priorities.needsAttention.slice(0, 5).map((item) => (
                <PriorityClientCard key={item.client.id} item={item} type="attention" onResolve={resolveAlert} resolving={resolvingAlertId === item.alertId} />
              ))}
              {!priorities.needsAttention.length ? (
                <p className="rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm leading-6 text-zinc-200">{t("trainer.noUrgentPriorities")}</p>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="text-teal-300" size={19} />
              <h2 className="text-lg font-semibold">{t("trainer.greatProgress")}</h2>
            </div>
            <div className="mt-3 space-y-3">
              {priorities.greatProgress.slice(0, 3).map((item) => <PriorityClientCard key={item.client.id} item={item} type="progress" />)}
              {!priorities.greatProgress.length ? (
                <DelightEmptyState tone="lime" title={t("trainer.noWinsMissed")} body={t("trainer.nextWinSurface")} />
              ) : null}
            </div>
          </div>
        </div>

        <details className="ascend-workspace-inset mt-4 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-200">{t("trainer.weeklyOverview")}</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-teal-200">{weeklySummary.improving}</span>{t("trainer.improving")}</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.plateaued}</span>{t("trainer.plateaued")}</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.checkInsDue}</span>{t("trainer.checkinsDue")}</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-purple-200">{weeklySummary.bodyScansDue}</span>{t("trainer.scansDue")}</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-lime">{weeklySummary.goalAchievements}</span>{t("trainer.goalsReached")}</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-white">{averageScore}</span>{t("trainer.avgMomentum")}</p>
          </div>
        </details>
      </section>

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("trainer.allClients")}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t("trainer.searchFilterPriority")}</p>
          </div>
          <Link href="/messages" className="ascend-pressable flex h-11 items-center gap-2 rounded-xl border border-calm/40 bg-calm/10 px-4 text-sm font-semibold text-calm">
            <MessageSquare size={17} /> {t("common.messages")}
          </Link>
        </div>
        <label className="mt-4 flex h-12 items-center gap-2 rounded-xl border border-line bg-ink px-3 focus-within:border-calm/50">
          <Search size={18} className="text-zinc-500" />
          <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder={t("trainer.searchClients")} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([["all", t("trainer.all")], ["attention", t("trainer.attention")], ["unread", t("trainer.unread")], ["on_track", t("trainer.onTrack")]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setClientFilter(value)} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${clientFilter === value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {visibleClients.length ? (
            visibleClients.map((client) => {
              const score = client.compliance_score;
              const label = riskLabel(client, t);
              return (
                <article key={client.id} className="ascend-workspace-inset p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <ProfileAvatar src={client.profile_photo_url} name={client.full_name} size="sm" />
                      <div className="min-w-0">
                      <p className="font-medium">{client.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatGoal(client.goal_type, t)}</p>
                      {Number(client.unread_messages ?? 0) > 0 ? <p className="mt-2 inline-flex rounded-full bg-calm/15 px-2 py-1 text-xs font-semibold text-calm">{t("trainer.unreadCount", { count: Number(client.unread_messages) })}</p> : null}
                      {client.goal_achieved_at ? (
                        <p className="mt-2 inline-flex rounded bg-lime px-2 py-1 text-xs font-semibold text-ink">{t("dashboard.goalAchieved")}</p>
                      ) : isRecent(client.goal_updated_at) ? (
                        <p className="mt-2 inline-flex rounded bg-calm/15 px-2 py-1 text-xs font-semibold text-calm">{t("trainer.goalUpdated")}</p>
                      ) : null}
                      {Number(client.consistency_streak ?? 0) >= 2 ? (
                        <p className="mt-2 inline-flex rounded bg-lime/10 px-2 py-1 text-xs font-semibold text-lime">
                          {t("trainer.consistencyStreak", { days: Number(client.consistency_streak) })}
                        </p>
                      ) : null}
                      <p className={`mt-2 text-xs font-semibold ${nutritionSummaryClass(client)}`}>
                        {t("trainer.nutritionLabel", { summary: nutritionSummaryMap.get(client.id) ?? t("trainer.noFoodLogged") })}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">{t("trainer.lastActivity", { date: daysAgo(lastActivityFor(client), t) })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={(score ?? 100) < 50 ? "font-semibold text-amber" : "font-semibold text-lime"}>
                        {score ?? "--"}/100
                      </p>
                      <span className={`mt-2 inline-block rounded px-2 py-1 text-xs ${riskClass(client)}`}>{label}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Link href={`/trainer/clients/${client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold">
                      {t("trainer.view")}
                    </Link>
                    <Link href={`/messages?userId=${client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink">
                      {t("common.messages")}
                    </Link>
                    <button
                      type="button"
                      disabled={praisingClientId === client.id}
                      onClick={() => sendPraise(client.id, client.full_name)}
                      className="ascend-pressable h-11 rounded-xl border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
                    >
                      {t("trainer.praise")}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <DelightEmptyState
              tone="purple"
              title={clients.length ? t("trainer.noClientsMatch") : t("trainer.coachingListReady")}
              body={clients.length ? t("trainer.clearSearchFilter") : t("trainer.clientsAssignedAppear")}
            />
          )}
        </div>
      </section>
    </>
  );
}
