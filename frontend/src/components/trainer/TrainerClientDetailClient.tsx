"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Sparkles, TrendingDown, Utensils } from "lucide-react";
import {
  createWeeklyCheckin,
  getTrainerClient,
  getTrainerClientFoodLogs,
  getTrainerClientProgressPhotos,
  getTrainerClientWaterLogs,
  getTrainerClientWeightLogs
} from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";

type ClientProfile = Awaited<ReturnType<typeof getTrainerClient>>["client"];
type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type ProgressPhoto = Awaited<ReturnType<typeof getTrainerClientProgressPhotos>>["progressPhotos"][number];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getTrainerClientWaterLogs>>["waterLogs"][number];

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
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [checkin, setCheckin] = useState("");
  const [status, setStatus] = useState("Loading client accountability...");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [profile, foods, progress, weights, waters] = await Promise.all([
          getTrainerClient(clientId),
          getTrainerClientFoodLogs(clientId),
          getTrainerClientProgressPhotos(clientId),
          getTrainerClientWeightLogs(clientId),
          getTrainerClientWaterLogs(clientId)
        ]);

        if (!isMounted) return;
        setClient(profile.client);
        setFoodLogs(foods.foodLogs);
        setProgressPhotos(progress.progressPhotos);
        setWeightLogs(weights.weightLogs);
        setWaterLogs(waters.waterLogs);
        setStatus("");
      } catch {
        if (isMounted) setStatus("Could not load this client. Make sure this is a trainer, owner, or admin account.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todaysFood = foodLogs.filter((log) => log.logged_at.slice(0, 10) === today);
  const todaysWaterMl = waterLogs.filter((log) => log.logged_at.slice(0, 10) === today).reduce((total, log) => total + log.amount_ml, 0);
  const latestWeight = weightLogs[0];
  const previousWeight = weightLogs[1];
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : 0;
  const score = client?.compliance_score;
  const latestFood = foodLogs[0];

  async function generateCheckin() {
    setIsGenerating(true);
    setCheckin("");

    try {
      const response = await createWeeklyCheckin(clientId);
      setCheckin(response.summary);
    } catch {
      setCheckin("Could not generate AI check-in yet. Make sure the OpenAI key is configured on the backend.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      <section className="mt-3">
        <Link href="/trainer" className="mb-3 grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Back to trainer dashboard">
          <ArrowLeft size={19} />
        </Link>
        <p className="text-sm text-zinc-400">Client profile</p>
        <h1 className="mt-1 text-2xl font-semibold">{client?.full_name ?? "Client"}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {formatGoal(client?.goal_type)} / {client?.gym_name ?? "Gym not set"}
        </p>
        {client?.id ? (
          <Link
            href={`/messages?userId=${client.id}`}
            className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink"
          >
            Message client
          </Link>
        ) : null}
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard
          label="Compliance"
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

      {(score ?? 100) < 50 ? (
        <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 text-amber" size={20} />
            <p className="text-sm leading-6 text-zinc-300">Compliance is below 50. Send a quick check-in today.</p>
          </div>
        </section>
      ) : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Food today" value={String(todaysFood.length)} detail={latestFood ? `Last: ${latestFood.estimated_food_name}` : "No food today"} />
        <MetricCard label="Water today" value={`${(todaysWaterMl / 1000).toFixed(1)}L`} detail="2.5L target" />
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
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
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
          <p className="text-sm text-zinc-300">Weight, water, food logs, and compliance now come from PostgreSQL.</p>
        </div>
      </section>
    </>
  );
}
