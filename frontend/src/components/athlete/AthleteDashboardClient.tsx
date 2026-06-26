"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Flag, Gauge, Target } from "lucide-react";
import {
  AthleteDashboard,
  getAthleteDashboard,
  saveAthleteCheckin,
  saveAthleteTargetProgress,
  updateAthleteProfile,
  updateAthleteTimezone
} from "@/lib/ascendApi";
import { markInstallEligible } from "@/lib/installAscend";

function labelTarget(type: string) {
  return type.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function bandClasses(band?: string) {
  if (band === "green") return "border-lime/40 bg-lime/10 text-lime";
  if (band === "yellow") return "border-amber/40 bg-amber/10 text-amber";
  return "border-red-400/40 bg-red-400/10 text-red-300";
}

const sliderLabels: Record<string, [string, string]> = {
  energy: ["Very low", "Excellent"],
  hunger: ["None", "Extreme"],
  soreness: ["None", "Severe"],
  stress: ["Calm", "Very stressed"],
  motivation: ["Low", "High"]
};

function targetInputLabel(type: string) {
  if (type === "steps") return "Today's steps";
  if (type === "cardio_minutes") return "Today's cardio minutes";
  if (type === "water_ml") return "Today's water intake (ml)";
  if (type.includes("session") || type === "runs") return "Today's completed sessions";
  if (type === "recovery_days") return "Today's recovery completed";
  return "Today's completed amount";
}

function isSessionTarget(type: string) {
  return type.includes("session") || type === "runs";
}

export function AthleteDashboardClient() {
  const [data, setData] = useState<AthleteDashboard | null>(null);
  const [status, setStatus] = useState("Loading Athlete Mode...");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ sport: "", division: "", competitionName: "", competitionDate: "", coachName: "", goalWeightKg: "" });
  const [checkin, setCheckin] = useState({ sleepHours: "8", energy: "7", soreness: "4", stress: "4", hunger: "5", motivation: "7" });
  const [targetValues, setTargetValues] = useState<Record<string, string>>({});

  async function load() {
    let response = await getAthleteDashboard();
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimezone && response.athlete.profile.timezone !== browserTimezone) {
      await updateAthleteTimezone(browserTimezone);
      response = await getAthleteDashboard();
    }
    setData(response.athlete);
    const next = response.athlete.profile;
    setProfile({
      sport: next.sport ?? "",
      division: next.division ?? "",
      competitionName: next.competition_name ?? "",
      competitionDate: next.competition_date?.slice(0, 10) ?? "",
      coachName: next.coach_name ?? "",
      goalWeightKg: next.goal_weight_kg ? String(next.goal_weight_kg) : ""
    });
    setTargetValues(Object.fromEntries(response.athlete.targets.map((target) => [target.id, String(target.today_completed_value)])));
    setStatus("");
  }

  useEffect(() => {
    load().catch((error) => setStatus(error instanceof Error ? error.message : "Athlete Mode could not load."));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateAthleteProfile({
        sport: profile.sport,
        division: profile.division || null,
        competitionName: profile.competitionName || null,
        competitionDate: profile.competitionDate || null,
        coachName: profile.coachName || null,
        goalWeightKg: profile.goalWeightKg ? Number(profile.goalWeightKg) : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      await load();
      setStatus("Athlete profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save athlete profile.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckin(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveAthleteCheckin({
        sleepHours: Number(checkin.sleepHours), energy: Number(checkin.energy), soreness: Number(checkin.soreness),
        stress: Number(checkin.stress), hunger: Number(checkin.hunger), motivation: Number(checkin.motivation)
      });
      await load();
      setStatus("Today's readiness check-in is saved.");
      markInstallEligible("first_action");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress(targetId: string, explicitValue?: number) {
    setSaving(true);
    try {
      await saveAthleteTargetProgress(targetId, explicitValue ?? Number(targetValues[targetId] ?? 0));
      await load();
      setStatus("Training progress updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update target.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-zinc-300">{status}</p>;
  }

  return (
    <>
      <section className="mt-4">
        <p className="text-sm text-purple-300">Athlete Mode</p>
        <h1 className="mt-1 text-3xl font-semibold">Prepare with clarity</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Readiness and training consistency for your next goal.</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
          <Flag className="text-purple-300" size={20} />
          <p className="mt-3 text-xs uppercase text-zinc-400">Event countdown</p>
          <p className="mt-1 text-3xl font-semibold">{data.countdown ? Math.max(0, data.countdown.days) : "--"}</p>
          <p className="mt-1 text-xs text-zinc-400">{data.countdown ? `${data.countdown.weeks} weeks out` : "Add an event date"}</p>
        </div>
        <div className={`rounded-lg border p-4 ${bandClasses(data.readiness.band ?? undefined)}`}>
          <Gauge size={20} />
          <p className="mt-3 text-xs uppercase text-zinc-400">Readiness</p>
          <p className="mt-1 text-3xl font-semibold">{data.readiness.score ?? "--"}</p>
          <p className="mt-1 text-xs text-zinc-400">{data.readiness.status}</p>
        </div>
      </section>

      {data.countdown?.milestone ? (
        <p className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-3 text-center text-sm font-semibold text-lime">{data.countdown.milestone}</p>
      ) : null}

      <Link href="/athlete/body-composition" className="mt-4 block rounded-lg border border-teal-400/40 bg-teal-400/10 p-4">
        <p className="text-sm font-semibold text-teal-300">Ascend DNA</p>
        <h2 className="mt-1 text-xl font-semibold">Body Composition Engine</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Upload body scan reports, confirm values, and track recomposition trends.</p>
      </Link>

      {data.readiness.warningReasons.length ? (
        <section className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 p-3">
          <p className="text-sm font-semibold text-red-300">Coach review recommended</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">{data.readiness.warningReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
        </section>
      ) : null}

      <details className="mt-4 rounded-lg border border-line bg-surface p-4">
        <summary className="flex cursor-pointer list-none items-center gap-3"><CalendarDays className="text-purple-300" size={20} /><span className="font-semibold">Event and athlete profile</span></summary>
        <form onSubmit={saveProfile} className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Sport", "sport", "HYROX, running, bodybuilding"], ["Division", "division", "Open, age group, class"],
            ["Event", "competitionName", "Competition name"], ["Coach", "coachName", "Coach name"]
          ].map(([label, key, placeholder]) => (
            <label key={key} className="text-xs text-zinc-400">{label}<input required={key === "sport"} value={profile[key as keyof typeof profile]} onChange={(e) => setProfile((current) => ({ ...current, [key]: e.target.value }))} placeholder={placeholder} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white outline-none focus:border-purple-400" /></label>
          ))}
          <label className="text-xs text-zinc-400">Competition date<input type="date" value={profile.competitionDate} onChange={(e) => setProfile((current) => ({ ...current, competitionDate: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Goal weight (kg)<input type="number" min="25" max="400" step="0.1" value={profile.goalWeightKg} onChange={(e) => setProfile((current) => ({ ...current, goalWeightKg: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white" /></label>
          <button disabled={saving || !profile.sport.trim()} className="col-span-2 h-11 rounded-lg bg-purple-400 font-semibold !text-white disabled:border disabled:border-line disabled:bg-ink disabled:!text-zinc-100">Save athlete profile</button>
        </form>
      </details>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">Daily readiness check-in</h2>
        <p className="mt-1 text-sm text-zinc-400">A 30-second signal that helps your coach adjust the plan.</p>
        <form onSubmit={saveCheckin} className="mt-4 space-y-4">
          <label className="block text-sm text-zinc-300">Sleep hours<input type="number" min="0" max="16" step="0.5" value={checkin.sleepHours} onChange={(e) => setCheckin((current) => ({ ...current, sleepHours: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3" /></label>
          {["energy", "soreness", "stress", "hunger", "motivation"].map((key) => (
            <label key={key} className="block text-sm capitalize text-zinc-300">{key}: <span className="font-semibold text-purple-300">{checkin[key as keyof typeof checkin]}/10</span><input type="range" min="1" max="10" value={checkin[key as keyof typeof checkin]} onChange={(e) => setCheckin((current) => ({ ...current, [key]: e.target.value }))} className="mt-2 w-full accent-purple-400" /><span className="mt-1 flex justify-between text-xs text-zinc-500"><span>{sliderLabels[key][0]}</span><span>{sliderLabels[key][1]}</span></span></label>
          ))}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-purple-400 font-semibold !text-white disabled:border disabled:border-line disabled:bg-ink disabled:!text-zinc-100">Save readiness</button>
        </form>
      </section>

      {(["daily", "weekly"] as const).map((cadence) => {
        const targets = data.targets.filter((target) => target.cadence === cadence);
        const compliance = cadence === "daily" ? data.dailyCompliancePercent : data.weeklyCompliancePercent;
        return (
      <section key={cadence} className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">{cadence === "daily" ? "Today's targets" : "Weekly targets"}</h2><p className="mt-1 text-sm text-zinc-400">{cadence === "daily" ? "Enter only what you completed today." : "Today’s entries add toward this week’s goal."}</p></div><span className="text-2xl font-semibold text-purple-300">{compliance}%</span></div>
        <div className="mt-4 space-y-3">
          {targets.map((target) => (
            <div key={target.id} className="rounded-lg bg-ink p-3">
              <div className="flex justify-between gap-3"><p className="text-sm font-medium">{labelTarget(target.target_type)}</p><p className="text-sm text-zinc-400">{cadence === "daily" ? `Daily target: ${target.target_value}` : `This week: ${target.weekly_completed_value}/${target.target_value}`} {target.unit}</p></div>
              {target.notes ? <p className="mt-1 text-xs text-zinc-500">{target.notes}</p> : null}
              <label className="mt-3 block text-xs text-zinc-400">{targetInputLabel(target.target_type)}<div className="mt-1 flex gap-2"><input aria-label={targetInputLabel(target.target_type)} type="number" min="0" step="0.1" value={targetValues[target.id] ?? ""} onChange={(e) => setTargetValues((current) => ({ ...current, [target.id]: e.target.value }))} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-white" /><button type="button" disabled={saving} onClick={() => saveProgress(target.id)} className="h-10 rounded-lg bg-purple-400 px-3 text-sm font-semibold !text-white disabled:border disabled:border-line disabled:bg-ink disabled:!text-zinc-100">Save today</button></div></label>
              {isSessionTarget(target.target_type) ? <button type="button" disabled={saving} onClick={() => saveProgress(target.id, Number(target.today_completed_value) + 1)} className="mt-2 h-10 w-full rounded-lg border border-purple-400/50 text-sm font-semibold text-purple-300 disabled:border-line disabled:bg-ink disabled:!text-zinc-100">+1 session completed</button> : null}
            </div>
          ))}
          {!targets.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No {cadence} targets assigned.</p> : null}
        </div>
      </section>
        );
      })}

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3"><CheckCircle2 className="text-purple-300" size={20} /><h2 className="font-semibold">Weekly coach review</h2></div>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{data.latestReview?.summary ?? "Your review will appear automatically."}</p>
        {data.latestReview?.coach_comment ? <p className="mt-3 rounded-lg bg-ink p-3 text-sm text-zinc-200"><span className="font-semibold text-purple-300">Coach:</span> {data.latestReview.coach_comment}</p> : null}
        <p className="mt-3 text-xs text-zinc-500">Updates automatically whenever Athlete Mode opens.</p>
      </section>

      {data.progressPhotos.length ? (
        <section className="mt-4 rounded-lg border border-line bg-surface p-4"><div className="flex items-center gap-3"><Target className="text-purple-300" size={20} /><h2 className="font-semibold">Latest progress</h2></div><div className="mt-3 grid grid-cols-2 gap-2">{data.progressPhotos.slice(0, 2).map((photo) => photo.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo.id} src={photo.image_url} alt={photo.photo_type} className="aspect-[3/4] w-full rounded-lg object-cover" />
        ) : null)}</div></section>
      ) : null}
    </>
  );
}
