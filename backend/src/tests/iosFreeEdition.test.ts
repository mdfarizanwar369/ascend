import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { dbQuery, verifyIdToken } = vi.hoisted(() => ({ dbQuery: vi.fn(), verifyIdToken: vi.fn() }));
vi.mock("../db/pool", () => ({ query: dbQuery, pool: {} }));
vi.mock("../integrations/firebase", () => ({ getFirebaseAuth: () => ({ verifyIdToken }) }));

import { appEditionMiddleware, isIosFreeEdition, isIosFreeRequest, withAppEdition } from "../services/appEdition";
import { getFoodAiAllowance, getCoachZoeAccess, assertFoodAiAllowance, assertCoachZoeConversationAccess } from "../services/aiUsageService";
import { requireActivePlan } from "../middleware/subscription";
import { requireAuth } from "../middleware/auth";
import { workoutCaptureAccessFor } from "../services/workoutCaptureAccess";
import { workoutDebriefTierFor, workoutDebriefAccessFor } from "../services/workoutDebriefAccessService";

const iphoneBrowser = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
function request(path = "/food-logs", headers: Record<string, string> = {}) {
  const get = (name: string) => headers[name.toLowerCase()];
  return { path, get, header: get } as Request;
}
function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
}
beforeEach(() => { dbQuery.mockReset(); verifyIdToken.mockReset(); });

describe("iOS free edition boundary", () => {
  it.each([
    [iphoneBrowser, false],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari", false],
    ["Mozilla Android AscendAndroid/1 Capacitor", false],
    [iphoneBrowser + " AscendIOS/2 Capacitor", true],
    ["Mozilla iPad AscendIOS/4 AscendFree/1 Capacitor", true]
  ])("classifies the native marker without restricting browsers: %s", (ua, expected) => {
    expect(isIosFreeRequest(request("/", { "user-agent": ua }))).toBe(expected);
  });
  it("supports the explicit native header", () => {
    expect(isIosFreeRequest(request("/", { "x-ascend-edition": "ios-free-v1" }))).toBe(true);
  });
  it.each(["/subscriptions/checkout", "/Subscriptions/Checkout/", "/subscriptions/portal", "/subscriptions/demo-activate", "/trainer/clients", "/admin/users", "/athlete/me", "/messages", "/reports/weekly/current", "/body-composition/scans", "/progress-photos", "/me/coach-homework/example"])("rejects a native paid route before side effects: %s", path => {
    const res = response(); const next = vi.fn();
    appEditionMiddleware(request(path, { "x-ascend-edition": "ios-free-v1" }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
  });
  it.each(["/food-logs", "/weight-logs", "/water-logs", "/burn-logs", "/ai/chat", "/ai/workout", "/ai/workout/today", "/burn-logs/completed-workout", "/subscriptions/me", "/me/account", "/me/ai-consent"])("keeps native free tools available: %s", path => {
    const next = vi.fn(() => expect(isIosFreeEdition()).toBe(true));
    appEditionMiddleware(request(path, { "user-agent": "AscendIOS/4 Capacitor" }), response(), next);
    expect(next).toHaveBeenCalledOnce();
  });
  it.each([iphoneBrowser, "Mozilla Android AscendAndroid/1 Capacitor"])("preserves the other clients' Stripe route: %s", ua => {
    const next = vi.fn(() => expect(isIosFreeEdition()).toBe(false));
    appEditionMiddleware(request("/subscriptions/checkout", { "user-agent": ua }), response(), next);
    expect(next).toHaveBeenCalledOnce();
  });
  it("isolates concurrent web and native requests", async () => {
    const values = await Promise.all([true, false, true, false].map(free => withAppEdition(free, async () => {
      await new Promise(resolve => setTimeout(resolve, free ? 5 : 1));
      return isIosFreeEdition();
    })));
    expect(values).toEqual([true, false, true, false]);
    expect(isIosFreeEdition()).toBe(false);
  });
  it("rejects paid feature access even for a native owner account", async () => {
    const req = { user: { id: "member", primaryRole: "owner", roles: ["owner", "admin"] } } as Request;
    const res = response(); const next = vi.fn();
    await withAppEdition(true, () => requireActivePlan("premium")(req, res, next));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
    await withAppEdition(false, () => requireActivePlan("premium")(req, response(), next));
    expect(next).toHaveBeenCalledOnce();
  });
  it("gives a signed-in trainer only member roles on iOS without editing their account", async () => {
    verifyIdToken.mockResolvedValue({ uid: "trainer-firebase", email: "trainer@example.com", email_verified: true });
    dbQuery.mockResolvedValue({ rows: [{ id: "trainer", firebase_uid: "trainer-firebase", email: "trainer@example.com", primary_role: "trainer", roles: ["trainer"], status: "active", trainer_id: "trainer-id" }] });
    const req = request("/me", { authorization: "Bearer test-token" });
    await withAppEdition(true, () => requireAuth(req, response(), vi.fn() as NextFunction));
    expect(req.user).toMatchObject({ primaryRole: "client", roles: ["client"], isPlatformOwner: false });
    expect(req.user?.trainerId).toBeUndefined();
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(dbQuery.mock.calls[0][0]).not.toMatch(/update|insert/i);
  });
});

describe("actual allowance services", () => {
  it("allows two daily iOS meal estimates, then rejects the third", async () => {
    dbQuery.mockResolvedValue({ rows: [{ used: "1" }] });
    const now = new Date("2026-09-16T06:00:00Z");
    expect(await withAppEdition(true, () => getFoodAiAllowance("member", -480, now))).toMatchObject({ period: "day", limit: 2, used: 1, remaining: 1 });
    expect(dbQuery.mock.calls[0][1][1]).toBe("2026-09-15T16:00:00.000Z");
    dbQuery.mockResolvedValue({ rows: [{ used: "2" }] });
    await expect(withAppEdition(true, () => assertFoodAiAllowance("member", -480))).rejects.toThrow(/resets at midnight/);
  });
  it("preserves web free and paid meal allowances", async () => {
    for (const [plan, role, period, limit] of [["free", "client", "week", 5], ["premium", "client", "day", 5], ["trainer_pro", "trainer", "day", 10]] as const) {
      dbQuery.mockResolvedValueOnce({ rows: [{ primary_role: role, roles: [role], active_plan: plan }] }).mockResolvedValueOnce({ rows: [{ used: "0" }] });
      expect(await withAppEdition(false, () => getFoodAiAllowance("member"))).toMatchObject({ period, limit });
    }
  });
  it("limits native Zoe replies to ten and counts quick-action modes too", async () => {
    dbQuery.mockResolvedValue({ rows: [{ used: "10" }] });
    expect(await withAppEdition(true, () => getCoachZoeAccess("paid-member"))).toMatchObject({ tier: "free", premiumDepth: false, dailyAskZoeLimit: 10, dailyAskZoeRemaining: 0 });
    expect(dbQuery.mock.calls[0][1][2]).toBe(true);
    await expect(withAppEdition(true, () => assertCoachZoeConversationAccess("paid-member"))).rejects.toThrow(/10 Zoe replies/);
    dbQuery.mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: "premium" }] });
    expect(await withAppEdition(false, () => getCoachZoeAccess("paid-member"))).toMatchObject({ premiumDepth: true, dailyAskZoeLimit: null });
  });
  it("caps paid and owner iOS accounts at three captures and one weekly review", () => {
    const identity = { activePlan: "trainer_pro" as const, primaryRole: "owner" as const, roles: ["owner" as const], isPlatformOwner: true, athleteEnabled: true };
    withAppEdition(true, () => {
      expect(workoutCaptureAccessFor({ ...identity, featureEnabled: true, used: 3 })).toMatchObject({ canCapture: false, allowance: { tier: "free", limit: 3 } });
      const tier = workoutDebriefTierFor(identity);
      expect(tier).toBe("free");
      expect(workoutDebriefAccessFor({ tier, dailyUsed: 1, weeklyUsed: 1, oldestWeeklyGeneration: "2026-09-15T00:00:00Z" })).toMatchObject({ canGenerate: false, weeklyLimit: 1, nextWeeklyReviewAt: "2026-09-22T00:00:00.000Z" });
    });
    expect(workoutDebriefTierFor(identity)).toBe("athlete");
    expect(workoutCaptureAccessFor({ ...identity, featureEnabled: true, used: 3 }).canCapture).toBe(true);
  });
});
