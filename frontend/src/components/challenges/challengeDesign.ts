import { Droplets, Footprints, Utensils } from "lucide-react";
import { ptLocalDate, shiftPtDate, type ChallengeRules, type ChallengeTemplate } from "@ascend/shared";

export const templates = {
  meals: { name: "Meal Logging", title: "Food journal month", rule: "Finish a day of meal logging", description: "Mark the day complete after logging a meal.", goal: 15, Icon: Utensils, tone: "text-amber bg-amber/10 border-amber/25" },
  hydration: { name: "Hydration", title: "Hydration reset", rule: "Reach your personal water target", description: "Use the water target set when each member joins.", goal: 18, Icon: Droplets, tone: "text-calm bg-calm/10 border-calm/25" },
  movement: { name: "Movement", title: "Move more this month", rule: "Log a walk or workout", description: "Solo activity and completed PT sessions count.", goal: 12, Icon: Footprints, tone: "text-lime bg-lime/10 border-lime/25" }
};

export const statusLabels = { draft: "Draft", upcoming: "Upcoming", live: "Live now", finished: "Finished" };
export const panel = "rounded-[1.5rem] border border-line bg-surface";
export const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-ink px-4 text-sm font-semibold text-zinc-200 transition hover:border-calm/45 disabled:opacity-45";
export const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime px-4 text-sm font-bold text-ink transition hover:brightness-110 disabled:opacity-45";
export const field = "mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-line bg-ink px-3 text-sm text-white outline-none focus:border-calm [color-scheme:dark]";

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export function challengeDateRange(startsOn: string, endsOn: string) {
  return `${dayFormat.format(new Date(startsOn))} – ${dayFormat.format(new Date(endsOn))}`;
}

export function challengeDays(startsOn: string, endsOn: string) {
  return Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;
}

export function newChallengeRules(timeZone: string, template: ChallengeTemplate = "meals"): ChallengeRules {
  const day = ptLocalDate(new Date(), timeZone);
  const end = new Date(day + "T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const endsOn = end.toISOString().slice(0, 10);
  return {
    title: templates[template].title, template, actions: [template], requiredActions: 1,
    startsOn: day, endsOn, goalDays: Math.min(templates[template].goal, challengeDays(day, endsOn)), leaderboard: false
  };
}

export function nextChallengeMonth(endsOn: string, timeZone: string) {
  const next = new Date(endsOn + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const today = ptLocalDate(new Date(), timeZone);
  if (next.toISOString().slice(0, 10) < today) {
    next.setTime(Date.parse(today));
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
  }
  const startsOn = next.toISOString().slice(0, 10);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return { startsOn, endsOn: shiftPtDate(next.toISOString().slice(0, 10), -1) };
}
