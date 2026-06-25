"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateAdaptiveNutritionTargets } from "@ascend/shared";
import { AlertTriangle, Send, Sparkles, TrendingDown, Utensils } from "lucide-react";
import {
  createTrainerClientMission,
  createWeeklyCheckin,
  getTrainerClient,
  getTrainerClientFoodLogs,
  getTrainerClientMissions,
  getTrainerClientMessages,
  getTrainerClientNutritionPlan,
  getTrainerClientProgressPhotos,
  getTrainerClientProgressComparison,
  getTrainerClientWaterLogs,
  getTrainerClientWeightLogs,
  saveTrainerClientNutritionPlan,
  sendTrainerClientPraise,
  sendTrainerClientMessage
} from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";
import { BackButton } from "@/components/BackButton";
import { localDateKey } from "@/lib/date";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AthleteCoachPanel } from "@/components/athlete/AthleteCoachPanel";

type ClientProfile = Awaited<ReturnType<typeof getTrainerClient>>["client"];
type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type Message = Awaited<ReturnType<typeof getTrainerClientMessages>>["messages"][number];
type ProgressPhoto = Awaited<ReturnType<typeof getTrainerClientProgressPhotos>>["progressPhotos"][number];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getTrainerClientWaterLogs>>["waterLogs"][number];
type Mission = Awaited<ReturnType<typeof getTrainerClientMissions>>["missions"][number];
type ProgressComparison = Awaited<ReturnType<typeof getTrainerClientProgressComparison>>["comparison"];
type CoachNutritionPlan = Awaited<ReturnType<typeof getTrainerClientNutritionPlan>>["coachPlan"];

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  return "Goal not set";
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function TrainerClientDetailClient({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [progressComparison, setProgressComparison] = useState<ProgressComparison | null>(null);
  const [coachNutritionPlan, setCoachNutritionPlan] = useState<CoachNutritionPlan>(null);
  const [nutritionCalories, setNutritionCalories] = useState("");
  const [nutritionProtein, setNutritionProtein] = useState("");
  const [nutritionCarbs, setNutritionCarbs] = useState("");
  const [nutritionFat, setNutritionFat] = useState("");
  const [nutritionLabel, setNutritionLabel] = useState("");
  const [nutritionNote, setNutritionNote] = useState("");
  const [nutritionStatus, setNutritionStatus] = useState("");
  const [missionTitle, setMissionTitle] = useState("");
  const [missionDueDate, setMissionDueDate] = useState("");
  const [checkin, setCheckin] = useState("");
  const [status, setStatus] = useState("Loading client momentum...");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingMission, setIsSavingMission] = useState(false);
  const [isSendingPraise, setIsSendingPraise] = useState(false);
  const [isSavingNutrition, setIsSavingNutrition] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getTrainerClient(clientId);

        if (!isMounted) return;
        setClient(profile.client);
        setStatus("");

        const [foods, nextMessages, progress, weights, waters, nextMissions, comparison, nutritionPlan] = await Promise.allSettled([
          getTrainerClientFoodLogs(clientId),
          getTrainerClientMessages(clientId),
          getTrainerClientProgressPhotos(clientId),
          getTrainerClientWeightLogs(clientId),
          getTrainerClientWaterLogs(clientId),
          getTrainerClientMissions(clientId),
          getTrainerClientProgressComparison(clientId),
          getTrainerClientNutritionPlan(clientId)
        ]);

        if (!isMounted) return;
        if (foods.status === "fulfilled") setFoodLogs(foods.value.foodLogs);
        if (nextMessages.status === "fulfilled") setMessages(nextMessages.value.messages);
        if (progress.status === "fulfilled") setProgressPhotos(progress.value.progressPhotos);
        if (weights.status === "fulfilled") setWeightLogs(weights.value.weightLogs);
        if (waters.status === "fulfilled") setWaterLogs(waters.value.waterLogs);
        if (nextMissions.status === "fulfilled") setMissions(nextMissions.value.missions);
        if (comparison.status === "fulfilled") setProgressComparison(comparison.value.comparison);
        if (nutritionPlan.status === "fulfilled") {
          const plan = nutritionPlan.value.coachPlan;
          setCoachNutritionPlan(plan);
          if (plan) {
            setNutritionCalories(String(plan.calories));
            setNutritionProtein(String(plan.protein_g));
            setNutritionCarbs(String(plan.carbs_g));
            setNutritionFat(String(plan.fat_g));
            setNutritionLabel(plan.plan_label ?? "");
            setNutritionNote(plan.coach_note ?? "");
          }
        }

        if ([foods, nextMessages, progress, weights, waters, nextMissions].some((result) => result.status === "rejected")) {
          setStatus("Some client sections could not load yet. The main client profile is still available.");
        }
      } catch (error) {
        if (isMounted) setStatus(error instanceof Error ? error.message : "Could not load this client.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const today = useMemo(() => localDateKey(), []);
  const checkedInToday = client?.last_trainer_message_at ? localDateKey(client.last_trainer_message_at) === today : false;
  const todaysFood = foodLogs.filter((log) => localDateKey(log.logged_at) === today);
  const todaysNutrition = todaysFood.reduce(
    (total, log) => ({
      calories: total.calories + Number(log.calories ?? 0),
      proteinG: total.proteinG + asNumber(log.protein_g),
      carbsG: total.carbsG + asNumber(log.carbs_g),
      fatG: total.fatG + asNumber(log.fat_g)
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const todaysWaterMl = waterLogs.filter((log) => localDateKey(log.logged_at) === today).reduce((total, log) => total + log.amount_ml, 0);
  const latestWeight = weightLogs[0];
  const previousWeight = weightLogs[1];
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : 0;
  const score = client?.compliance_score;
  const latestFood = foodLogs[0];
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
        : "moderate"
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));

  useEffect(() => {
    if (coachNutritionPlan) return;
    if (nutritionCalories || nutritionProtein || nutritionCarbs || nutritionFat) return;
    setNutritionCalories(String(nutritionTargets.calorieTarget));
    setNutritionProtein(String(nutritionTargets.proteinTargetG));
    setNutritionCarbs(String(nutritionTargets.carbsTargetG));
    setNutritionFat(String(nutritionTargets.fatTargetG));
  }, [coachNutritionPlan, nutritionCalories, nutritionProtein, nutritionCarbs, nutritionFat, nutritionTargets]);

  async function generateCheckin() {
    setIsGenerating(true);
    setCheckin("");

    try {
      const response = await createWeeklyCheckin(clientId);
      setCheckin(response.summary);
    } catch {
      setCheckin("Could not generate AI check-in yet. Make sure the AI provider is configured and has available credits.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = messageBody.trim();
    if (!trimmed) return;

    setIsSendingMessage(true);
    setMessageBody("");

    try {
      const response = await sendTrainerClientMessage(clientId, trimmed);
      setMessages((current) => [...current, response.message]);
      setClient((current) => (current ? { ...current, last_trainer_message_at: response.message.created_at } : current));
      setStatus("Check-in sent.");
    } catch {
      setMessageBody(trimmed);
      setStatus("Could not send message. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleCreateMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = missionTitle.trim();
    if (!trimmed) return;

    setIsSavingMission(true);
    setStatus("");

    try {
      const response = await createTrainerClientMission({
        clientId,
        title: trimmed,
        dueDate: missionDueDate || undefined
      });
      setMissions((current) => [response.mission, ...current]);
      setMissionTitle("");
      setMissionDueDate("");
      setStatus("Mission assigned.");
    } catch {
      setStatus("Could not assign mission. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSavingMission(false);
    }
  }

  async function handleSendPraise() {
    setIsSendingPraise(true);
    setStatus("");

    try {
      await sendTrainerClientPraise(clientId);
      setStatus("Praise sent. The client will see it on their dashboard.");
    } catch {
      setStatus("Could not send praise yet. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSendingPraise(false);
    }
  }

  async function handleSaveNutritionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const calories = Number(nutritionCalories);
    const proteinG = Number(nutritionProtein);
    const carbsG = Number(nutritionCarbs);
    const fatG = Number(nutritionFat);

    if (![calories, proteinG, carbsG, fatG].every((value) => Number.isFinite(value) && value >= 0)) {
      setNutritionStatus("Enter valid numbers for calories, protein, carbs, and fat.");
      return;
    }

    setIsSavingNutrition(true);
    setNutritionStatus("Saving coach plan...");
    try {
      const response = await saveTrainerClientNutritionPlan(clientId, {
        calories,
        proteinG,
        carbsG,
        fatG,
        planLabel: nutritionLabel || null,
        coachNote: nutritionNote || null
      });
      setCoachNutritionPlan(response.coachPlan);
      setNutritionStatus("Coach Plan saved. The client will be notified.");
    } catch (error) {
      setNutritionStatus(error instanceof Error ? error.message : "Could not save Coach Plan.");
    } finally {
      setIsSavingNutrition(false);
    }
  }

  return (
    <>
      <section className="mt-3">
        <div className="mb-3">
          <BackButton fallbackHref="/trainer" />
        </div>
        <div className="flex items-center gap-3">
          <ProfileAvatar src={client?.profile_photo_url} name={client?.full_name} size="md" />
          <div className="min-w-0">
            <p className="text-sm text-zinc-400">Client profile</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{client?.full_name ?? "Client"}</h1>
            <p className="mt-1 text-sm text-zinc-400">{formatGoal(client?.goal_type)} / {client?.gym_name ?? "Gym not set"}</p>
          </div>
        </div>
        {client?.goal_achieved_at ? (
          <p className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm font-semibold text-lime">
            Goal achieved. This is a great moment to celebrate and agree on the next goal.
          </p>
        ) : client?.goal_updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">Goal last updated {new Date(client.goal_updated_at).toLocaleDateString()}</p>
        ) : null}
        {client?.id ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href={`/messages?userId=${client.id}`}
              className="flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink"
            >
              Open chat
            </Link>
            <button
              type="button"
              disabled={isSendingPraise}
              onClick={handleSendPraise}
              className="h-12 rounded-lg border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
            >
              {isSendingPraise ? "Sending..." : "Send praise"}
            </button>
          </div>
        ) : null}
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <AthleteCoachPanel clientId={clientId} />

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard
          label="Momentum"
          value={`${score ?? "--"}/100`}
          detail={score === null || score === undefined ? "No score yet" : score < 50 ? "High risk" : score < 70 ? "Watch" : "On track"}
          tone={(score ?? 100) < 50 ? "warning" : "success"}
        />
        <MetricCard
          label="Weight"
          value={latestWeight ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg` : "--"}
          detail={weightDelta ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg vs previous` : "No trend yet"}
          tone={weightDelta > 0.5 ? "warning" : "default"}
        />
      </section>

      {progressComparison ? (
        <div className="mt-4">
          <ProgressComparisonCard comparison={progressComparison} photoHref="#progress-photos" />
        </div>
      ) : null}

      {(score ?? 100) < 50 ? (
        <section className={`mt-4 rounded-lg p-4 ${checkedInToday ? "border border-calm/40 bg-calm/10" : "border border-amber/40 bg-amber/10"}`}>
          <div className="flex gap-3">
            <AlertTriangle className={`mt-0.5 ${checkedInToday ? "text-calm" : "text-amber"}`} size={20} />
            <p className="text-sm leading-6 text-zinc-300">
              {checkedInToday ? "Momentum is still low, but you already checked in with this client today." : "Momentum is low today. Send a quick check-in."}
            </p>
          </div>
        </section>
      ) : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Food today" value={String(todaysFood.length)} detail={latestFood ? `Last: ${latestFood.estimated_food_name}` : "No food today"} />
        <MetricCard label="Water today" value={`${(todaysWaterMl / 1000).toFixed(1)}L`} detail="2.5L target" />
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Nutrition today</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Client intake compared with their daily guide.</p>
          </div>
          <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{todaysFood.length} logs</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Calories", todaysNutrition.calories.toLocaleString(), `${nutritionTargets.calorieTarget.toLocaleString()} kcal`],
            ["Protein", `${Math.round(todaysNutrition.proteinG)}g`, `${nutritionTargets.proteinTargetG}g guide`],
            ["Carbs", `${Math.round(todaysNutrition.carbsG)}g`, `${nutritionTargets.carbsTargetG}g guide`],
            ["Fat", `${Math.round(todaysNutrition.fatG)}g`, `${nutritionTargets.fatTargetG}g guide`]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg bg-ink p-3">
              <p className="text-xs uppercase text-zinc-400">{label}</p>
              <p className="mt-2 text-xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-xs text-zinc-500">of {detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-calm">Customize Nutrition Plan</p>
            <h2 className="mt-1 text-lg font-semibold">Coach Plan</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Ascend keeps its recommendation in the background. Saving a Coach Plan makes the client dashboard follow your targets.
            </p>
          </div>
          <span className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-calm">
            {coachNutritionPlan ? "Active" : "Optional"}
          </span>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-ink p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">Ascend Recommendation</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {nutritionTargets.calorieTarget.toLocaleString()} kcal / Protein {nutritionTargets.proteinTargetG}g / Carbs {nutritionTargets.carbsTargetG}g / Fat {nutritionTargets.fatTargetG}g
          </p>
        </div>

        <form onSubmit={handleSaveNutritionPlan} className="mt-4 space-y-3">
          <input
            value={nutritionLabel}
            onChange={(event) => setNutritionLabel(event.target.value)}
            placeholder="Plan label, e.g. Fat Loss Phase"
            maxLength={80}
            className="h-12 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none focus:border-lime"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Calories
              <input value={nutritionCalories} onChange={(event) => setNutritionCalories(event.target.value)} inputMode="numeric" className="h-12 rounded-lg border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Protein
              <input value={nutritionProtein} onChange={(event) => setNutritionProtein(event.target.value)} inputMode="numeric" className="h-12 rounded-lg border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Carbohydrates
              <input value={nutritionCarbs} onChange={(event) => setNutritionCarbs(event.target.value)} inputMode="numeric" className="h-12 rounded-lg border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Fat
              <input value={nutritionFat} onChange={(event) => setNutritionFat(event.target.value)} inputMode="numeric" className="h-12 rounded-lg border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
          </div>
          <textarea
            value={nutritionNote}
            onChange={(event) => setNutritionNote(event.target.value)}
            rows={3}
            maxLength={800}
            placeholder="Optional coach note, e.g. Lean bulk, contest preparation, medical clearance received, custom goal."
            className="min-h-24 w-full resize-none rounded-lg border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={isSavingNutrition}
            className="h-12 w-full rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isSavingNutrition ? "Saving..." : "Save Changes"}
          </button>
        </form>
        {coachNutritionPlan?.updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">Last updated {new Date(coachNutritionPlan.updated_at).toLocaleString()}</p>
        ) : null}
        {nutritionStatus ? <p className="mt-3 rounded-lg border border-line bg-ink p-3 text-sm text-zinc-300">{nutritionStatus}</p> : null}
      </section>

      <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
        <h2 className="text-base font-semibold text-calm">Daily mission</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Give one simple action for the client to complete between sessions.</p>
        <form onSubmit={handleCreateMission} className="mt-4 space-y-3">
          <textarea
            value={missionTitle}
            onChange={(event) => setMissionTitle(event.target.value)}
            rows={2}
            maxLength={180}
            placeholder="Example: Walk 20 minutes today"
            className="min-h-20 w-full resize-none rounded-lg border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <input
            type="date"
            value={missionDueDate}
            onChange={(event) => setMissionDueDate(event.target.value)}
            className="h-12 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={!missionTitle.trim() || isSavingMission}
            className="h-12 w-full rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isSavingMission ? "Assigning..." : "Assign mission"}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {missions.slice(0, 5).map((mission) => (
            <article key={mission.id} className="rounded-lg bg-ink p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{mission.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">Due {new Date(mission.due_date).toLocaleDateString()}</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${mission.status === "completed" ? "bg-lime text-ink" : "bg-surface text-zinc-300"}`}>
                  {mission.status === "completed" ? "Done" : "Open"}
                </span>
              </div>
            </article>
          ))}
          {!missions.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No missions assigned yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Client messages</h2>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-ink p-3">
          {messages.slice(-8).map((message) => {
            const fromClient = message.sender_user_id === clientId;
            return (
              <article key={message.id} className={`flex ${fromClient ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[82%] rounded-lg px-3 py-2 ${fromClient ? "bg-surface text-zinc-100" : "bg-lime text-ink"}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <p className={`mt-1 text-[11px] ${fromClient ? "text-zinc-500" : "text-ink/70"}`}>
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              </article>
            );
          })}
          {!messages.length ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">No messages with this client yet.</p> : null}
        </div>
        <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
          <textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            rows={1}
            placeholder="Reply to client..."
            className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={!messageBody.trim() || isSendingMessage}
            className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <Utensils className="text-lime" size={20} />
          <h2 className="text-base font-semibold">Latest food logs</h2>
        </div>
        <div className="mt-3 space-y-2">
          {foodLogs.slice(0, 5).map((log) => (
            <article key={log.id} className="rounded-lg bg-ink p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {log.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={log.image_url} alt={log.estimated_food_name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{log.estimated_food_name}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      P {Math.round(asNumber(log.protein_g))}g / C {Math.round(asNumber(log.carbs_g))}g / F {Math.round(asNumber(log.fat_g))}g
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold">{log.calories} kcal</p>
              </div>
            </article>
          ))}
          {!foodLogs.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No food logs yet.</p> : null}
        </div>
        <Link
          href={`/trainer/clients/${clientId}/meals`}
          className="mt-3 flex h-12 items-center justify-center rounded-lg border border-lime/40 bg-lime/10 font-semibold text-lime"
        >
          View Full Meal History
        </Link>
      </section>

      <section id="progress-photos" className="mt-4 scroll-mt-20 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Progress photos</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {progressPhotos.slice(0, 6).map((photo) => (
            <article key={photo.id} className="overflow-hidden rounded-lg bg-ink">
              <div className="grid aspect-[3/4] place-items-center">
                {photo.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.image_url} alt={photo.photo_type} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-zinc-500">No image</span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium capitalize">{photo.photo_type}</p>
                <p className="mt-1 text-xs text-zinc-500">{new Date(photo.logged_at).toLocaleDateString()}</p>
              </div>
            </article>
          ))}
          {!progressPhotos.length ? <p className="col-span-3 rounded-lg bg-ink p-3 text-sm text-zinc-400">No progress photos yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 text-calm" size={20} />
          <div>
            <p className="text-sm font-semibold text-calm">AI weekly check-in</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {checkin || "Generate a draft check-in based on this client's recent logs."}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={isGenerating}
          onClick={generateCheckin}
          className="mt-4 h-12 w-full rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
        >
          {isGenerating ? "Generating..." : "Generate check-in"}
        </button>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="text-lime" size={20} />
          <p className="text-sm text-zinc-300">Weight, water, food logs, and momentum come from Ascend records.</p>
        </div>
      </section>
    </>
  );
}
