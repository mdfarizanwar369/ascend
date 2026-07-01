"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { calculateAdaptiveNutritionTargets } from "@ascend/shared";
import { CalendarClock, ChevronLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import {
  getTrainerClient,
  getTrainerClientBurnLogs,
  getTrainerClientCoachPresence,
  getTrainerClientFoodLogs,
  getTrainerClientMissions,
  getTrainerClientWaterLogs,
  getTrainerClientWeeklyReport,
  getTrainerClientWeightLogs
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { buildCoachingTimelineGroups, CoachingTimelineGroups } from "@/components/trainer/TrainerCoachingTimeline";

type ClientProfile = Awaited<ReturnType<typeof getTrainerClient>>["client"];
type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getTrainerClientWaterLogs>>["waterLogs"][number];
type BurnLog = Awaited<ReturnType<typeof getTrainerClientBurnLogs>>["burnLogs"][number];
type Mission = Awaited<ReturnType<typeof getTrainerClientMissions>>["missions"][number];
type WeeklyReport = Awaited<ReturnType<typeof getTrainerClientWeeklyReport>>["report"];
type CoachPresence = Awaited<ReturnType<typeof getTrainerClientCoachPresence>>;

const FOOD_PAGE_SIZE = 50;

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function TimelineShell({
  title,
  children,
  action
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Coaching Timeline</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TrainerCoachingTimelineHistoryClient({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [burnLogs, setBurnLogs] = useState<BurnLog[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport>(null);
  const [coachPresence, setCoachPresence] = useState<CoachPresence>({ latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } });
  const [nextFoodOffset, setNextFoodOffset] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading coaching timeline...");
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus("Loading coaching timeline...");
      try {
        const [
          profileResponse,
          foodResponse,
          weightResponse,
          waterResponse,
          burnResponse,
          missionResponse,
          coachPresenceResponse,
          weeklyReportResponse
        ] = await Promise.all([
          getTrainerClient(clientId),
          getTrainerClientFoodLogs(clientId, { range: "all", order: "newest", limit: FOOD_PAGE_SIZE, offset: 0 }),
          getTrainerClientWeightLogs(clientId),
          getTrainerClientWaterLogs(clientId),
          getTrainerClientBurnLogs(clientId),
          getTrainerClientMissions(clientId),
          getTrainerClientCoachPresence(clientId),
          getTrainerClientWeeklyReport(clientId)
        ]);

        if (!active) return;
        setClient(profileResponse.client);
        setFoodLogs(foodResponse.foodLogs);
        setNextFoodOffset(foodResponse.nextOffset ?? null);
        setWeightLogs(weightResponse.weightLogs);
        setWaterLogs(waterResponse.waterLogs);
        setBurnLogs(burnResponse.burnLogs);
        setMissions(missionResponse.missions);
        setCoachPresence(coachPresenceResponse);
        setWeeklyReport(weeklyReportResponse.report);
        setStatus("");
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "Unable to load coaching timeline.");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [clientId]);

  const latestWeight = weightLogs[0] ?? null;
  const previousWeight = weightLogs[1] ?? null;
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : 0;

  const nutritionTargets = calculateAdaptiveNutritionTargets({
    goalType: client?.goal_type,
    sex: client?.gender === "female" || client?.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client?.age_years,
    heightCm: client?.height_cm,
    weightKg: latestWeight?.weight_kg ?? client?.starting_weight_kg,
    targetWeightKg: client?.target_weight_kg,
    activityLevel:
      client?.activity_level === "low" || client?.activity_level === "moderate" || client?.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client?.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));

  const timelineGroups = useMemo(() => buildCoachingTimelineGroups({
    foodLogs,
    waterLogs,
    burnLogs,
    coachPresenceHistory: coachPresence.history,
    missions,
    weeklyReport,
    latestWeight,
    previousWeight,
    weightDelta,
    goalType: client?.goal_type,
    proteinTargetG: nutritionTargets.proteinTargetG
  }), [burnLogs, client?.goal_type, coachPresence.history, foodLogs, latestWeight, missions, nutritionTargets.proteinTargetG, previousWeight, waterLogs, weeklyReport, weightDelta]);

  async function loadMoreFoodLogs() {
    if (nextFoodOffset === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await getTrainerClientFoodLogs(clientId, {
        range: "all",
        order: "newest",
        limit: FOOD_PAGE_SIZE,
        offset: nextFoodOffset
      });
      setFoodLogs((current) => [...current, ...response.foodLogs]);
      setNextFoodOffset(response.nextOffset ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load more timeline history.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallbackHref={`/trainer/clients/${clientId}`} />
        <Link href={`/trainer/clients/${clientId}`} className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-zinc-200">
          <ChevronLeft size={16} />
          Client profile
        </Link>
      </div>

      <TimelineShell
        title={client ? `${client.full_name}'s full coaching timeline` : "Full coaching timeline"}
        action={<CalendarClock className="text-calm" size={24} />}
      >
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          A chronological coaching summary of nutrition, hydration, Coach Zoe support, workouts, missions, and progress signals.
        </p>
      </TimelineShell>

      {status ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm leading-6 text-zinc-400">{status}</p>
      ) : null}

      {timelineGroups.length ? (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <CoachingTimelineGroups groups={timelineGroups} />
          {nextFoodOffset !== null ? (
            <button
              type="button"
              onClick={loadMoreFoodLogs}
              disabled={isLoadingMore}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={isLoadingMore ? "animate-spin" : ""} size={18} />
              {isLoadingMore ? "Loading older history..." : "Load Older Nutrition History"}
            </button>
          ) : null}
        </section>
      ) : !status ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm leading-6 text-zinc-400">
          No coaching timeline yet. Once the client logs activity, receives Coach Zoe support, or completes missions, their history will appear here.
        </p>
      ) : null}
    </div>
  );
}
