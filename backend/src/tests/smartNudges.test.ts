import { describe, expect, it } from "vitest";
import { comebackAttempt, defaultNudgePreferences, inNudgeQuietHours, nudgeCategories, nudgeLocalParts, nudgePriority,
  nudgeSuppression, nudgeTemplates, nudgeWallTime, recordedWorkoutMilestone, safeNotificationHref, validTimezone, NudgeEligibilityFacts } from "@ascend/shared";
import { classifyApns, classifyFcmError } from "../integrations/nudgePush";
import { nudgePreferencesSchema } from "../services/smartNudgePolicy";
const now = new Date("2026-10-14T12:00:00Z");
const prefs = defaultNudgePreferences(); prefs.enabled = true; prefs.categories.lunch.enabled = true;
const facts: NudgeEligibilityFacts = { now, due: now, expires: new Date(now.getTime() + 3600000), category: "lunch", rollout: true,
  device: true, versionMatches: true, actionCompleted: false, relevant: true, pendingMessage: false, duplicate: false,
  dayCount: 0, rollingCount: 0, routineCount: 0, workoutCount: 0, lastDispatch: null };
describe("Smart Nudges deterministic policy", () => {
  it("starts entirely opted out and rejects unknown/malformed preferences", () => {
    const defaults = defaultNudgePreferences(); expect(defaults.enabled).toBe(false);
    expect(nudgeCategories.every(c => !defaults.categories[c].enabled)).toBe(true);
    expect(nudgePreferencesSchema.safeParse({ ...defaults, timezone: "Mars/Base" }).success).toBe(false);
    expect(nudgePreferencesSchema.safeParse({ ...defaults, quietStart: "24:15" }).success).toBe(false);
    expect(nudgePreferencesSchema.safeParse({ ...defaults, magic: true }).success).toBe(false);
  });
  it.each([
    ["2026-10-14", "12:00", "Asia/Singapore", "2026-10-14T04:00:00.000Z"],
    ["2026-10-14", "12:00", "Asia/Kathmandu", "2026-10-14T06:15:00.000Z"],
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"]
  ])("resolves %s %s in %s once", (date, time, timezone, expected) => expect(nudgeWallTime(date, time, timezone)?.toISOString()).toBe(expected));
  it("skips DST gaps, including half-hour transitions, and invalid zones", () => {
    expect(nudgeWallTime("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(nudgeWallTime("2026-10-04", "02:15", "Australia/Lord_Howe")).toBeNull();
    expect(validTimezone("nope")).toBe(false);
    expect(nudgeLocalParts(new Date("2026-10-14T23:30Z"), "Asia/Singapore").date).toBe("2026-10-15");
  });
  it("handles quiet hours across midnight, boundaries and all-day quiet", () => {
    for (const time of ["22:00", "23:59", "00:00", "07:59"]) expect(inNudgeQuietHours(time, "22:00", "08:00")).toBe(true);
    expect(inNudgeQuietHours("08:00", "22:00", "08:00")).toBe(false);
    expect(inNudgeQuietHours("12:00", "12:00", "12:00")).toBe(true);
    expect(inNudgeQuietHours("14:00", "13:00", "15:00")).toBe(true);
  });
  it.each([
    [{ rollout: false }, "rollout_off"], [{ device: false }, "no_device"], [{ versionMatches: false }, "preferences_changed"],
    [{ actionCompleted: true }, "action_completed"], [{ relevant: false }, "no_longer_relevant"], [{ duplicate: true }, "duplicate"],
    [{ dayCount: 4 }, "overall_cap"], [{ rollingCount: 4 }, "overall_cap"], [{ expires: now }, "expired"],
    [{ lastDispatch: new Date(now.getTime() - 60 * 60000) }, "cooldown"]
  ] as const)("suppresses ineligible facts %j", (overrides, expected) => expect(nudgeSuppression(prefs, { ...facts, ...overrides })).toBe(expected));
  it("honours master/category consent, routine intensity and pending messages", () => {
    expect(nudgeSuppression(prefs, facts)).toBeNull();
    expect(nudgeSuppression({ ...prefs, enabled: false }, facts)).toBe("consent_off");
    const weekly = structuredClone(prefs); weekly.categories.weekly.enabled = true;
    expect(nudgeSuppression(weekly, { ...facts, category: "weekly" })).toBe("minimal_mode");
    weekly.intensity = "balanced";
    expect(nudgeSuppression(weekly, { ...facts, category: "weekly", routineCount: 2 })).toBe("routine_cap");
    weekly.intensity = "supportive";
    expect(nudgeSuppression(weekly, { ...facts, category: "weekly", routineCount: 2 })).toBeNull();
    expect(nudgeSuppression(weekly, { ...facts, category: "weekly", pendingMessage: true })).toBe("pending_message");
  });
  it("prioritises appointments, meals, weekly and coaching in that order", () => {
    expect(["milestone", "comeback", "morning", "weekly", "lunch", "workout"].sort((a,b) => nudgePriority[a as keyof typeof nudgePriority] - nudgePriority[b as keyof typeof nudgePriority]))
      .toEqual(["workout", "lunch", "weekly", "morning", "comeback", "milestone"]);
  });
  it("limits comeback attempts and only accepts verified milestone counts", () => {
    const anchor = new Date(now.getTime() - 14 * 86400000);
    expect(comebackAttempt(now, anchor, 7, 0, null)).toBe(true);
    expect(comebackAttempt(now, anchor, 7, 3, null)).toBe(false);
    expect(comebackAttempt(now, anchor, 7, 1, new Date(now.getTime() - 6 * 86400000))).toBe(false);
    expect(comebackAttempt(now, now, 3, 0, null)).toBe(false);
    expect([0,1,2,9,10,11,25,26].map(recordedWorkoutMilestone)).toEqual([null,1,1,1,10,10,25,25]);
  });
  it("uses curated generic content, existing destinations and no shame or health statistics", () => {
    for (const template of Object.values(nudgeTemplates)) {
      expect(template.body.length).toBeLessThan(160);
      expect(template.body).not.toMatch(/failed|broken streak|calories|kg|weight loss|you forgot|behind|didn.t eat|miss you|dehydrated/i);
      expect(safeNotificationHref(template.href)).toBe(template.href);
    }
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil", "/notifications/open?id=no", "/admin", "/food-log?meal=dinner&next=https://evil", "javascript:alert(1)"])("rejects unsafe destination %s", value => expect(safeNotificationHref(value)).toBe("/dashboard" === value ? value : value.startsWith("/food-log?") ? "/food-log" : "/dashboard"));
  it("retries only definite provider rejections; ambiguous outcomes are terminal", () => {
    expect(classifyFcmError({ code: "messaging/server-unavailable" }).status).toBe("retry");
    expect(classifyFcmError({ code: "messaging/internal-error" }).status).toBe("unknown");
    expect(classifyFcmError(new Error("token=should-not-leak"))).toEqual({ status: "unknown", code: "provider_outcome_unknown" });
    expect(classifyFcmError({ code: "messaging/registration-token-not-registered" }).invalidToken).toBe(true);
    expect(classifyApns(200, "").status).toBe("accepted");
    expect(classifyApns(503, "ServiceUnavailable").status).toBe("retry");
    expect(classifyApns(410, "Unregistered").invalidToken).toBe(true);
    expect(classifyApns(403, "BadCertificate").status).toBe("failed");
  });
});
