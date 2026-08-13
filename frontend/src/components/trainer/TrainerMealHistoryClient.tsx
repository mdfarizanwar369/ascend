"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateAdaptiveNutritionTargets } from "@ascend/shared";
import { CalendarDays, ChevronLeft, Utensils } from "lucide-react";
import { getTrainerClient, getTrainerClientFoodLogs, getTrainerClientWeightLogs } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { localDateKey } from "@/lib/date";
import { SectionShell, SkeletonCardList } from "@/components/PerceivedLoading";

type RangeFilter = "today" | "7d" | "30d" | "all";
type OrderFilter = "newest" | "oldest";
type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type ClientProfile = Awaited<ReturnType<typeof getTrainerClient>>["client"];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];

const rangeOptions: Array<{ label: string; value: RangeFilter }> = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "All Time", value: "all" }
];

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dateLabel(dateKey: string) {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : dateKey;
}

function dateKeysForRange(range: RangeFilter) {
  if (range === "all") return [];
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}

function parseAiEstimate(raw: unknown): { confidence?: number; notes?: string } {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const confidence = Number(source.confidence ?? source.confidenceScore ?? source.confidence_score);
  const notes = source.notes ?? source.note ?? source.explanation;
  return {
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    notes: typeof notes === "string" ? notes : undefined
  };
}

function summarizeLogs(logs: FoodLog[]) {
  return logs.reduce(
    (total, log) => ({
      calories: total.calories + asNumber(log.calories),
      proteinG: total.proteinG + asNumber(log.protein_g),
      carbsG: total.carbsG + asNumber(log.carbs_g),
      fatG: total.fatG + asNumber(log.fat_g)
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

function complianceStatus(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: { calorieTarget: number; proteinTargetG: number }) {
  if (!logs.length) return { label: "No Food Logged", tone: "danger" as const };
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  if (logs.length >= 2 && proteinRatio >= 0.8 && calorieRatio >= 0.65 && calorieRatio <= 1.15) {
    return { label: "Excellent Compliance", tone: "success" as const };
  }
  return { label: "Partial Compliance", tone: "warning" as const };
}

function coachingInsights(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: { calorieTarget: number; proteinTargetG: number }) {
  if (!logs.length) return ["No meals logged for this date."];

  const insights: string[] = [];
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  const lateNightMeal = logs.some((log) => {
    const hour = new Date(log.logged_at).getHours();
    return hour >= 22 || hour < 4;
  });

  insights.push(proteinRatio >= 0.9 ? "Protein target achieved." : "Protein below target.");
  if (calorieRatio >= 0.8 && calorieRatio <= 1.1) insights.push("Calories within target.");
  if (calorieRatio > 1.1) insights.push("Calories above target.");
  if (calorieRatio < 0.8) insights.push("Calories below target.");
  insights.push(logs.length >= 2 ? "Consistent logging." : "Only one meal logged.");
  if (lateNightMeal) insights.push("Late-night eating observed.");

  return insights;
}

export function TrainerMealHistoryClient({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [range, setRange] = useState<RangeFilter>("7d");
  const [order, setOrder] = useState<OrderFilter>("newest");
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading this client's meal history...");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isInitialLoading = !client && !foodLogs.length && status.startsWith("Loading");

  const targets = useMemo(() => calculateAdaptiveNutritionTargets({
    goalType: client?.goal_type,
    sex: client?.gender === "female" || client?.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client?.age_years,
    heightCm: client?.height_cm,
    weightKg: weights[0]?.weight_kg ?? client?.starting_weight_kg,
    targetWeightKg: client?.target_weight_kg,
    activityLevel:
      client?.activity_level === "low" || client?.activity_level === "moderate" || client?.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client?.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  }, weights.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at }))), [client, weights]);
  const effectiveTargets = useMemo(() => ({
    ...targets,
    calorieTarget: client?.nutrition_targets?.calories ?? targets.calorieTarget,
    proteinTargetG: client?.nutrition_targets?.proteinG ?? targets.proteinTargetG,
    carbsTargetG: client?.nutrition_targets?.carbsG ?? targets.carbsTargetG,
    fatTargetG: client?.nutrition_targets?.fatG ?? targets.fatTargetG
  }), [client?.nutrition_targets, targets]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setStatus("Loading this client's meal history...");
      try {
        const [profile, foodResponse, weightResponse] = await Promise.all([
          getTrainerClient(clientId),
          getTrainerClientFoodLogs(clientId, { range, order, limit: 30, offset: 0 }),
          getTrainerClientWeightLogs(clientId)
        ]);
        if (!isMounted) return;
        setClient(profile.client);
        setFoodLogs(foodResponse.foodLogs);
        setWeights(weightResponse.weightLogs);
        setNextOffset(foodResponse.nextOffset ?? null);
        setStatus("");
      } catch (error) {
        if (isMounted) setStatus(error instanceof Error ? error.message : "Could not load meal history.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [clientId, range, order]);

  async function loadMore() {
    if (nextOffset === null) return;
    setIsLoadingMore(true);
    setStatus("");
    try {
      const response = await getTrainerClientFoodLogs(clientId, { range, order, limit: 30, offset: nextOffset });
      setFoodLogs((current) => [...current, ...response.foodLogs]);
      setNextOffset(response.nextOffset ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load more meals.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const groupedDays = useMemo(() => {
    const map = new Map<string, FoodLog[]>();
    for (const log of foodLogs) {
      const key = localDateKey(log.logged_at);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), log]);
    }

    const visibleKeys = range === "all"
      ? Array.from(map.keys()).sort((a, b) => order === "newest" ? b.localeCompare(a) : a.localeCompare(b))
      : dateKeysForRange(range);

    return visibleKeys.map((dateKey) => {
      const logs = [...(map.get(dateKey) ?? [])].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
      const totals = summarizeLogs(logs);
      const status = complianceStatus(logs, totals, effectiveTargets);
      return {
        dateKey,
        logs,
        totals,
        status,
        insights: coachingInsights(logs, totals, effectiveTargets)
      };
    });
  }, [effectiveTargets, foodLogs, order, range]);

  if (isInitialLoading) {
    return (
      <>
        <section className="mt-3">
          <div className="mb-3">
            <BackButton fallbackHref={`/trainer/clients/${clientId}`} />
          </div>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-lime text-ink">
              <Utensils size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-zinc-400">Trainer meal history</p>
              <h1 className="mt-1 truncate text-2xl font-semibold">Client meals</h1>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Read-only nutrition review grouped by date.</p>
            </div>
          </div>
        </section>
        <SectionShell title="Meal history">
          <SkeletonCardList count={3} compact />
        </SectionShell>
        <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p>
      </>
    );
  }

  return (
    <>
      <section className="mt-3">
        <div className="mb-3">
          <BackButton fallbackHref={`/trainer/clients/${clientId}`} />
        </div>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-lime text-ink">
            <Utensils size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-zinc-400">Trainer meal history</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{client?.full_name ?? "Client meals"}</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Read-only nutrition review grouped by date.</p>
          </div>
        </div>
      </section>

      <section className="ascend-workspace-section sticky top-2 z-20 mt-4 p-3 backdrop-blur sm:p-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-lime" size={19} />
          <h2 className="text-base font-semibold">Filters</h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={`h-11 rounded-lg border px-2 text-sm font-semibold ${
                range === option.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOrder((current) => current === "newest" ? "oldest" : "newest")}
          className="mt-3 h-11 w-full rounded-lg border border-line bg-ink text-sm font-semibold text-zinc-200"
        >
          {order === "newest" ? "Newest First" : "Oldest First"}
        </button>
      </section>

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 space-y-4">
        {groupedDays.map((day) => (
          <article key={day.dateKey} className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{dateLabel(day.dateKey)}</h2>
                <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  day.status.tone === "success"
                    ? "bg-lime text-ink"
                    : day.status.tone === "warning"
                      ? "bg-amber/20 text-amber"
                      : "bg-red-500/15 text-red-300"
                }`}>
                  {day.status.label}
                </p>
              </div>
              <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{day.logs.length} meals</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Calories", `${Math.round(day.totals.calories).toLocaleString()} kcal`],
                ["Protein", `${Math.round(day.totals.proteinG)}g`],
                ["Carbs", `${Math.round(day.totals.carbsG)}g`],
                ["Fat", `${Math.round(day.totals.fatG)}g`]
              ].map(([label, value]) => (
                <div key={label} className="border-l border-line pl-3 first:border-l-0 first:pl-0">
                  <p className="text-xs uppercase text-zinc-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-ink p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">Coach observations</p>
              <div className="mt-2 space-y-1">
                {day.insights.map((insight) => (
                  <p key={insight} className="text-sm leading-6 text-zinc-300">{insight}</p>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {day.logs.map((log) => {
                const ai = parseAiEstimate(log.ai_estimate_raw);
                return (
                  <div key={log.id} className="rounded-xl bg-ink p-3">
                    <div className="flex items-start gap-3">
                      {log.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.image_url} alt={log.estimated_food_name} className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-surface text-zinc-500">
                          <Utensils size={18} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{log.estimated_food_name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatTime(log.logged_at)}</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold">{Math.round(asNumber(log.calories))} kcal</p>
                        </div>
                        <p className="mt-2 text-xs text-zinc-400">
                          P {Math.round(asNumber(log.protein_g))}g / C {Math.round(asNumber(log.carbs_g))}g / F {Math.round(asNumber(log.fat_g))}g
                        </p>
                        {ai.confidence !== undefined ? (
                          <p className="mt-2 text-xs text-zinc-500">AI confidence: {Math.round(ai.confidence * 100)}%</p>
                        ) : null}
                        {ai.notes || log.description ? (
                          <p className="mt-2 text-xs leading-5 text-zinc-400">{ai.notes ?? log.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!day.logs.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No meals were recorded on this date.</p> : null}
            </div>
          </article>
        ))}

        {!groupedDays.length && !status ? (
          <article className="ascend-workspace-section p-4 sm:p-5">
            <p className="text-sm leading-6 text-zinc-400">This client has not built a meal history yet. Once they start logging, their meals will appear here by date.</p>
          </article>
        ) : null}
      </section>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {nextOffset !== null ? (
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={loadMore}
            className="ascend-pressable h-12 rounded-lg border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
          >
            {isLoadingMore ? "Loading..." : "Load more meals"}
          </button>
        ) : null}
        <Link href={`/trainer/clients/${clientId}`} className="ascend-pressable flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface font-semibold text-zinc-200 hover:border-calm/40">
          <ChevronLeft size={18} />
          Back to client profile
        </Link>
      </div>
    </>
  );
}
