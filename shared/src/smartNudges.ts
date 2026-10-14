/** Deterministic, provider-independent Smart Nudges policy. No health data in templates. */
export const nudgeCategories = ["breakfast", "lunch", "dinner", "workout", "hydration", "morning", "evening", "weekly", "comeback", "milestone"] as const;
export type NudgeCategory = typeof nudgeCategories[number];
export type NudgeIntensity = "minimal" | "balanced" | "supportive";
export type NudgePreferences = {
  enabled: boolean;
  timezone: string;
  intensity: NudgeIntensity;
  quietStart: string;
  quietEnd: string;
  weeklyDay: number;
  comebackDays: 3 | 7 | 14;
  categories: Record<NudgeCategory, { enabled: boolean; time: string }>;
};
export const nudgeLabels: Record<NudgeCategory, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", workout: "Scheduled workouts", hydration: "Water check-in",
  morning: "Morning planning", evening: "Evening reflection", weekly: "Weekly review", comeback: "A gentle return", milestone: "Recorded milestones"
};
export function defaultNudgePreferences(timezone = "UTC"): NudgePreferences {
  const times = ["08:00", "12:30", "19:00", "09:00", "15:00", "08:30", "20:30", "19:30", "12:00", "18:00"];
  return { enabled: false, timezone, intensity: "minimal", quietStart: "22:00", quietEnd: "08:00", weeklyDay: 0, comebackDays: 7,
    categories: Object.fromEntries(nudgeCategories.map((c, i) => [c, { enabled: false, time: times[i] }])) as NudgePreferences["categories"] };
}
export const nudgePriority: Record<NudgeCategory, number> = { workout: 1, breakfast: 2, lunch: 2, dinner: 2, hydration: 2, weekly: 3, morning: 4, evening: 4, comeback: 5, milestone: 6 };
export function isRoutineNudge(category: NudgeCategory) { return !["workout", "breakfast", "lunch", "dinner", "hydration"].includes(category); }
export function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return timezone.length <= 100; } catch { return false; }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function nudgeLocalParts(at: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (formatters.size > 128) formatters.clear();
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
/** Resolve a wall time using the offsets on both sides of any nearby transition.
 * A gap returns null. A repeated wall time selects the first instant, once. */
export function nudgeWallTime(date: string, time: string, timezone: string): Date | null {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || !validTimezone(timezone)) return null;
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = wall + hours * 3600000;
    const local = nudgeLocalParts(new Date(probe), timezone);
    offsets.add(Date.parse(`${local.date}T${local.time}:00Z`) - probe);
  }
  const matches = [...offsets].map(offset => new Date(wall - offset)).filter(at => {
    const local = nudgeLocalParts(at, timezone); return local.date === date && local.time === time;
  });
  return matches.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}
export function nudgeDatePlus(date: string, days: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function inNudgeQuietHours(time: string, start: string, end: string) {
  if (start === end) return true; // Explicit all-day quiet; the UI explains this.
  return start < end ? time >= start && time < end : time >= start || time < end;
}
export const nudgeTemplates: Record<NudgeCategory, { title: string; body: string; href: string }> = {
  breakfast: { title: "A moment with Ascend", body: "Want to record breakfast while it is fresh in your mind?", href: "/food-log?meal=breakfast" },
  lunch: { title: "A moment with Ascend", body: "Want to snap a quick photo for your lunch log?", href: "/food-log?meal=lunch" },
  dinner: { title: "A moment with Ascend", body: "Your dinner log is here whenever you want to add it.", href: "/food-log?meal=dinner" },
  workout: { title: "Your Ascend reminder", body: "You have a session planned. View or adjust it when you are ready.", href: "/workout-schedule" },
  hydration: { title: "A moment with Ascend", body: "Want to add a water check-in?", href: "/water-log" },
  morning: { title: "A little space to plan", body: "Want to take a moment to plan your day?", href: "/dashboard" },
  evening: { title: "A moment to reflect", body: "Before you wind down, want to review what you recorded today?", href: "/dashboard" },
  weekly: { title: "Your weekly check-in", body: "Let’s review what you have recorded and look ahead at your own pace.", href: "/journey" },
  comeback: { title: "Whenever you are ready", body: "No pressure to catch up. You can start fresh whenever you are ready.", href: "/coach" },
  milestone: { title: "A moment worth recognising", body: "You have reached a recorded workout milestone. Take a look at your progress.", href: "/progress" }
};
export const nudgeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Reject all external, protocol-relative, encoded and unrecognised destinations. */
export function safeNotificationHref(input: unknown): string {
  if (typeof input !== "string" || input.length > 200 || !input.startsWith("/") || input.startsWith("//") || /[%\\#\s]/.test(input)) return "/dashboard";
  const [path, params = ""] = input.split("?");
  if (path === "/notifications/open") return /^id=/.test(params) && nudgeUuid.test(params.slice(3)) ? input : "/dashboard";
  if (path === "/workout-schedule") return !params || (/^id=/.test(params) && nudgeUuid.test(params.slice(3))) ? input : "/dashboard";
  if (path === "/food-log") return !params || /^meal=(breakfast|lunch|dinner)$/.test(params) ? input : "/food-log";
  if (path === "/coach" && params === "workout=1") return input;
  if (path.startsWith("/coach-homework/") && !params && nudgeUuid.test(path.slice("/coach-homework/".length))) return path;
  return !params && ["/dashboard", "/water-log", "/burn-log", "/journey", "/progress", "/coach", "/messages", "/reports", "/trainer", "/weight-log", "/habits", "/momentum-score"].includes(path) ? path : "/dashboard";
}
export type NudgeEligibilityFacts = {
  now: Date; due: Date; expires: Date; category: NudgeCategory; rollout: boolean; device: boolean;
  versionMatches: boolean; actionCompleted: boolean; relevant: boolean; pendingMessage: boolean; duplicate: boolean;
  dayCount: number; rollingCount: number; routineCount: number; workoutCount: number; lastDispatch: Date | null;
};
export function nudgeSuppression(prefs: NudgePreferences, f: NudgeEligibilityFacts): string | null {
  if (!f.rollout) return "rollout_off";
  if (!prefs.enabled || !prefs.categories[f.category].enabled) return "consent_off";
  if (!f.versionMatches) return "preferences_changed";
  if (!f.device) return "no_device";
  if (!validTimezone(prefs.timezone)) return "timezone_invalid";
  if (f.now < f.due) return "not_due";
  if (f.now >= f.expires) return "expired";
  if (inNudgeQuietHours(nudgeLocalParts(f.now, prefs.timezone).time, prefs.quietStart, prefs.quietEnd)) return "quiet_hours";
  if (f.actionCompleted) return "action_completed";
  if (!f.relevant) return "no_longer_relevant";
  if (f.duplicate) return "duplicate";
  if (isRoutineNudge(f.category) && prefs.intensity === "minimal") return "minimal_mode";
  if (f.pendingMessage && isRoutineNudge(f.category)) return "pending_message";
  if (f.dayCount >= 4 || f.rollingCount >= 4) return "overall_cap";
  if (f.category === "workout" && f.workoutCount >= 2) return "workout_cap";
  if (isRoutineNudge(f.category) && f.routineCount >= (prefs.intensity === "supportive" ? 3 : 2)) return "routine_cap";
  if (f.lastDispatch && f.now.getTime() - f.lastDispatch.getTime() < 90 * 60000) return "cooldown";
  return null;
}
export function comebackAttempt(now: Date, anchor: Date, firstDays: number, previousAttempts: number, lastAttempt: Date | null) {
  return previousAttempts < 3 && now.getTime() - anchor.getTime() >= firstDays * 86400000
    && (!lastAttempt || now.getTime() - lastAttempt.getTime() >= 7 * 86400000);
}
export function recordedWorkoutMilestone(count: number) { return Number.isInteger(count) ? [25, 10, 1].find(m => count >= m) ?? null : null; }
