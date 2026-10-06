"use client";
import { useEffect,useState } from "react";
import type { DailyActivitySummary } from "@ascend/shared";
import { getPrivateHealthInsights } from "@/lib/ascendApi";

export function PrivateActivityHistory() {
  const [days,setDays] = useState<DailyActivitySummary[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getPrivateHealthInsights().then(result => { if (alive) setDays(result.days); }).catch(() => undefined); };
    refresh(); window.addEventListener("ascend:health-updated",refresh);
    return () => { alive=false; window.removeEventListener("ascend:health-updated",refresh); };
  },[]);
  if (!days.length) return null;
  return <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
    <h2 className="font-semibold">Your private activity · last 7 days</h2>
    <p className="mt-2 text-xs leading-5 text-zinc-400">Uses the same daily totals as your dashboard. These imports and their derived Momentum score are not included in AI or trainer reflections.</p>
    <div className="mt-4 space-y-3">{[...days].reverse().map(day => <div key={day.day} className="border-t border-line pt-3">
      <p className="text-sm font-semibold">{day.day}</p>
      <p className="mt-1 text-sm text-zinc-300">{day.steps === null ? "No readable steps" : `${day.steps.toLocaleString()} steps`} · {day.displayedCalories === null ? "No readable energy" : `${Math.round(day.displayedCalories).toLocaleString()} ${day.energyBasis === "mixed_estimate" ? "estimated activity" : "active"} kcal`}</p>
      <p className="mt-1 text-xs text-zinc-400">{day.coverage === "workouts_only" ? "Recorded workouts only · partial day" : day.coverage === "stale_provider_daily" ? "Last recorded energy · not currently refreshing" : day.coverage === "provider_daily" ? "Apple Health daily energy" : "Manual activity only"}</p>
    </div>)}</div>
  </section>;
}
