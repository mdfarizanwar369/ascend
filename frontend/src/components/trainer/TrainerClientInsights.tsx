"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, CalendarDays, Dumbbell, Moon, Utensils } from "lucide-react";
import { getTrainerClientInsights, type TrainerClientInsights } from "@/lib/ascendApi";

type InsightMetric = "training" | "food" | "recovery";
type BarMetric = "training" | "entries" | "calories" | "protein";
type InsightDay = TrainerClientInsights["days"][number];

const metricMeta = {
  training: { label: "Training", icon: Dumbbell, tint: "text-lime", glow: "from-lime/20" },
  food: { label: "Food logs", icon: Utensils, tint: "text-teal-200", glow: "from-teal-300/20" },
  recovery: { label: "Recovery", icon: Moon, tint: "text-purple-200", glow: "from-purple-400/20" }
} as const;

function dayLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", long
    ? { day: "numeric", month: "short" }
    : { weekday: "short" });
}

function barGroups(days: InsightDay[], metric: BarMetric) {
  const groupSize = days.length > 7 ? 5 : 1;
  return Array.from({ length: Math.ceil(days.length / groupSize) }, (_, index) => {
    const slice = days.slice(index * groupSize, (index + 1) * groupSize);
    return {
      label: groupSize === 1 ? dayLabel(slice[0].date) : dayLabel(slice[0].date, true),
      fullLabel: groupSize === 1 ? dayLabel(slice[0].date, true) : `${dayLabel(slice[0].date, true)} to ${dayLabel(slice.at(-1)!.date, true)}`,
      value: Math.round(slice.reduce((total, day) => total + (
        metric === "training" ? day.recordedWorkouts
          : metric === "entries" ? day.foodEntries
            : metric === "calories" ? day.loggedCalories ?? 0
              : day.loggedProteinG ?? 0
      ), 0))
    };
  });
}

function RecordedBars({ days, metric }: { days: InsightDay[]; metric: BarMetric }) {
  const groups = useMemo(() => barGroups(days, metric), [days, metric]);
  const maximum = Math.max(1, ...groups.map((group) => group.value));
  const noun = metric === "training" ? "recorded workout" : metric === "entries" ? "food log entry" : metric === "calories" ? "logged kcal" : "logged g protein";
  const plural = metric === "training" ? "recorded workouts" : metric === "entries" ? "food log entries" : noun;

  return (
    <div>
      <div className="relative rounded-[1.35rem] border border-white/5 bg-[#0a131d]/80 px-4 pb-4 pt-5">
        <div className="pointer-events-none absolute inset-x-4 bottom-12 top-5 flex flex-col justify-between">
          {[0, 1, 2].map((line) => <span key={line} className="border-t border-dashed border-white/[0.075]" />)}
        </div>
        <div className="relative flex h-36 items-end gap-2 sm:gap-3" role="img" aria-label={`${plural} over the last ${days.length} days`}>
          {groups.map((group) => (
            <div key={group.fullLabel} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[11px] font-semibold tabular-nums text-zinc-300">{group.value || ""}</span>
              <div className="flex h-24 w-full items-end rounded-t-xl bg-white/[0.035]" title={`${group.fullLabel}: ${group.value} ${group.value === 1 ? noun : plural}`}>
                <div
                  className={`w-full rounded-t-xl transition-[height] duration-500 ${group.value ? metric === "training" ? "bg-gradient-to-t from-lime/55 to-lime shadow-[0_0_22px_rgba(53,242,208,0.16)]" : "bg-gradient-to-t from-calm/70 to-purple-300 shadow-[0_0_22px_rgba(139,92,246,0.18)]" : "bg-white/[0.055]"}`}
                  style={{ height: group.value ? `${Math.max(14, Math.round((group.value / maximum) * 100))}%` : "3px" }}
                />
              </div>
              <span className="w-full truncate text-center text-[10px] font-medium text-zinc-500">{group.label}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {groups.map((group) => <li key={group.fullLabel}>{group.fullLabel}: {group.value} {group.value === 1 ? noun : plural}</li>)}
      </ul>
      <p className="mt-3 text-xs leading-5 text-zinc-400">
        {metric === "training"
          ? "Shows workout records in Ascend. It does not measure sessions completed outside the app."
          : metric === "entries"
            ? "Shows entries clients recorded. A day without an entry does not mean they did not eat."
            : "Totals include only food recorded in Ascend. An incomplete log is not a full day of eating."}
      </p>
    </div>
  );
}

function RecoveryCalendar({ days }: { days: InsightDay[] }) {
  const qualityTone = {
    good: "border-lime/50 bg-lime/25 text-lime",
    okay: "border-purple-300/50 bg-purple-300/20 text-purple-200",
    poor: "border-amber/50 bg-amber/20 text-amber"
  } as const;
  const hasAny = days.some((day) => day.sleepQuality || day.sleepHours !== null);

  return (
    <div>
      <div className="rounded-[1.35rem] border border-white/5 bg-[#0a131d]/80 p-4">
        {hasAny ? (
          <div className="grid grid-cols-7 gap-2" role="img" aria-label={`Recovery records over the last ${days.length} days`}>
            {days.map((day) => {
              const tone = day.sleepQuality ? qualityTone[day.sleepQuality] : day.sleepHours !== null ? "border-calm/50 bg-calm/20 text-purple-200" : "border-white/5 bg-white/[0.035] text-zinc-600";
              const detail = day.sleepHours !== null ? `${day.sleepHours}h sleep recorded` : day.sleepQuality ? `${day.sleepQuality} sleep quality` : "No check-in";
              return (
                <div key={day.date} className="min-w-0 text-center" title={`${dayLabel(day.date, true)}: ${detail}`}>
                  <div className={`grid aspect-square min-h-8 place-items-center rounded-xl border text-[11px] font-semibold ${tone}`}>
                    {day.sleepHours !== null ? `${day.sleepHours}h` : day.sleepQuality ? day.sleepQuality.charAt(0).toUpperCase() : "·"}
                  </div>
                  {days.length === 7 ? <span className="mt-2 block text-[10px] text-zinc-500">{dayLabel(day.date)}</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center text-center">
            <Moon size={25} className="text-purple-200" />
            <p className="mt-3 text-sm font-semibold text-white">No recovery check-ins recorded</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-400">The trainer view will fill in when existing check-ins are available.</p>
          </div>
        )}
      </div>
      {hasAny ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-zinc-400">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-lime" />Good</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-purple-300" />Okay</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber" />Poor</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-zinc-600" />No entry</span>
      </div> : null}
      <p className="mt-3 text-xs leading-5 text-zinc-400">Sleep hours appear only for Athlete Mode clients who already record them. Other clients may have a quality check-in.</p>
    </div>
  );
}

export function TrainerClientInsightsPanel({ clientId }: { clientId: string }) {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [metric, setMetric] = useState<InsightMetric>("training");
  const [foodMetric, setFoodMetric] = useState<"entries" | "calories" | "protein">("entries");
  const [insights, setInsights] = useState<TrainerClientInsights | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getTrainerClientInsights(clientId, windowDays)
      .then((response) => {
        if (!active) return;
        setInsights(response.insights);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setInsights(null);
        setError("Insights are temporarily unavailable. Your other trainer tools still work.");
      });
    return () => { active = false; };
  }, [clientId, windowDays]);

  const visible = insights?.windowDays === windowDays ? insights : null;
  const activeMeta = metricMeta[metric];
  const ActiveIcon = activeMeta.icon;

  return (
    <section aria-label="Client insights" className="relative mt-4 overflow-hidden rounded-[1.75rem] border border-lime/25 bg-[radial-gradient(circle_at_92%_4%,rgba(53,242,208,0.16),transparent_14rem),radial-gradient(circle_at_2%_85%,rgba(139,92,246,0.17),transparent_18rem),linear-gradient(160deg,#172331,#0b131d_72%)] p-4 shadow-soft sm:p-5">
      <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full border border-lime/10" />
      <div className="pointer-events-none absolute -right-5 -top-5 h-32 w-32 rounded-full border border-lime/10" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-lime">
              <Activity size={15} /> Client signals
            </div>
            <h2 className="mt-2 text-[1.55rem] font-semibold leading-tight tracking-tight text-white">The coaching picture</h2>
            <p className="mt-2 max-w-md text-xs leading-5 text-zinc-300">What was recorded, where the gaps are, and what is worth discussing next.</p>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-lime/25 bg-lime/10 text-lime shadow-[0_0_25px_rgba(53,242,208,0.1)]">
            <CalendarDays size={19} />
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-full border border-white/10 bg-ink/80 p-1" aria-label="Insight timeframe">
          {([7, 30] as const).map((value) => <button key={value} type="button" onClick={() => setWindowDays(value)} aria-pressed={windowDays === value} className={`min-h-9 rounded-full px-4 text-xs font-semibold ${windowDays === value ? "bg-lime text-ink shadow-[0_0_16px_rgba(53,242,208,0.18)]" : "text-zinc-400 hover:text-white"}`}>{value} days</button>)}
        </div>

        {error ? <p role="status" className="mt-5 rounded-xl border border-amber/25 bg-amber/10 p-3 text-sm text-amber">{error}</p> : null}
        {!visible && !error ? <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Loading client insights">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/5" />)}</div> : null}

        {visible ? <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {(["training", "food", "recovery"] as const).map((key) => {
              const meta = metricMeta[key];
              const Icon = meta.icon;
              const value = key === "training" ? String(visible.summary.recordedWorkouts) : key === "food" ? `${visible.summary.foodLoggedDays}/${windowDays}` : `${visible.summary.recoveryCheckinDays}/${windowDays}`;
              const caption = key === "training" ? "recorded sessions" : key === "food" ? "days logged" : "check-in days";
              return <button key={key} type="button" onClick={() => setMetric(key)} aria-pressed={metric === key} className={`relative min-w-0 overflow-hidden rounded-2xl border p-3 text-left ${metric === key ? "border-lime/35 bg-white/[0.09]" : "border-white/[0.07] bg-ink/45 hover:bg-white/[0.07]"}`}>
                <span className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.glow} to-transparent opacity-60`} />
                <span className="relative block"><Icon size={16} className={meta.tint} /></span>
                <span className="relative mt-3 block truncate text-xl font-semibold leading-none tabular-nums text-white sm:text-2xl">{value}</span>
                <span className="relative mt-2 block text-[10px] leading-4 text-zinc-400">{caption}</span>
              </button>;
            })}
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-ink/45 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] ${activeMeta.tint}`}><ActiveIcon size={15} /> {activeMeta.label}</div>
                <h3 className="mt-1 text-base font-semibold text-white">{metric === "training" ? "Sessions recorded" : metric === "food" ? "Logging rhythm" : "Recovery check-ins"}</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-zinc-300">{windowDays}-day view</span>
            </div>
            {metric === "food" ? <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-white/[0.07] bg-[#0a131d]/65 p-1" aria-label="Food chart measure">
              {(["entries", "calories", "protein"] as const).map((value) => <button key={value} type="button" onClick={() => setFoodMetric(value)} aria-pressed={foodMetric === value} className={`min-h-8 flex-1 rounded-lg px-2 text-[11px] font-semibold ${foodMetric === value ? "bg-purple-300/20 text-purple-100" : "text-zinc-400 hover:text-white"}`}>{value === "entries" ? "Entries" : value === "calories" ? "Calories" : "Protein"}</button>)}
            </div> : null}
            {metric === "recovery" ? <RecoveryCalendar days={visible.days} /> : <RecordedBars days={visible.days} metric={metric === "training" ? "training" : foodMetric} />}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-calm/25 bg-calm/[0.09] p-3.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-calm/20 text-purple-200"><Activity size={14} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200">For your next conversation</p>
              <p className="mt-1 text-xs leading-5 text-zinc-200">{visible.summary.recordedWorkouts || visible.summary.foodEntries || visible.summary.recoveryCheckinDays
                ? `Review ${visible.summary.recordedWorkouts} recorded workout${visible.summary.recordedWorkouts === 1 ? "" : "s"}, ${visible.summary.foodLoggedDays} food-logging day${visible.summary.foodLoggedDays === 1 ? "" : "s"}, and ${visible.summary.recoveryCheckinDays} recovery check-in day${visible.summary.recoveryCheckinDays === 1 ? "" : "s"} with the client.`
                : "There are no new records in this period. A gentle conversation can provide context before changing the plan."}</p>
            </div>
          </div>
          <Link href={`/messages?userId=${clientId}`} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-lime/35 bg-lime/10 text-sm font-semibold text-lime hover:bg-lime/15">Open conversation <ArrowUpRight size={16} /></Link>
        </> : null}
      </div>
    </section>
  );
}
