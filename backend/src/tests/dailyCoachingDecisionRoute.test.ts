import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const refineMock = vi.fn();
let isPlatformOwner = true;

vi.mock("../config/env", () => ({
  env: {
    AI_PROVIDER: "gemini",
    GEMINI_MODEL: "gemini-test",
    OPENAI_MODEL: "openai-test",
    MOMENTUM_V2: true,
    DAILY_COACHING_DECISION_V1: false,
    DAILY_COACHING_DECISION_SHADOW: true,
    DAILY_COACHING_DECISION_OWNER_PILOT: true,
    DAILY_COACHING_DECISION_LOGS: false
  }
}));

vi.mock("../db/pool", () => ({ query: queryMock }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: isPlatformOwner ? "owner@example.com" : "member@example.com",
      primaryRole: "client",
      roles: ["client"],
      isPlatformOwner
    };
    next();
  }
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/rateLimits", () => ({ aiRateLimit: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../integrations/openai", () => ({
  TODAY_PRIORITY_PROMPT_VERSION: "today-priority-referee-v2",
  refineTodayPriority: refineMock,
  createCoachWorkoutPlan: vi.fn(),
  createCoachZoeReply: vi.fn(),
  createWorkoutCaptureDraft: vi.fn(),
  estimateBurnFromText: vi.fn()
}));
vi.mock("../services/aiUsageService", () => ({ getCoachZoeAccess: vi.fn(), logAiUsage: vi.fn(async () => undefined) }));
vi.mock("../services/healthSyncService", () => ({ getHealthSyncSummary: vi.fn(async () => null) }));
vi.mock("../services/workoutMemoryService", () => ({ buildWorkoutMemorySummary: vi.fn() }));
vi.mock("../services/workoutPlannerPersonalizationService", () => ({ buildWorkoutPlannerContext: vi.fn() }));
vi.mock("../services/workoutCaptureAccess", () => ({ getWorkoutCaptureAccess: vi.fn() }));
vi.mock("../services/nutritionTargetService", () => ({
  resolveNutritionTargets: vi.fn(async () => ({ calories: 2_000, proteinG: 125, carbsG: 220, fatG: 65, waterMl: 2_500 }))
}));

function previousLocalEvening(timezoneOffsetMinutes: number) {
  const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  const localDayStartUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
    + timezoneOffsetMinutes * 60_000;
  return new Date(localDayStartUtc - 4 * 60 * 60_000).toISOString();
}

function configureQueries(timezoneOffsetMinutes: number, options: { failDecisionWrite?: boolean } = {}) {
  queryMock.mockImplementation(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("from food_logs where user_id")) return { rows: [{ meals: 2, protein_g: 130 }] };
    if (normalized.includes("from water_logs where user_id")) return { rows: [{ water_ml: 2_500 }] };
    if (normalized.includes("from analytics_events") && normalized.includes("event_name = 'burn_log'")) {
      return { rows: [{ latest_at: previousLocalEvening(timezoneOffsetMinutes), completed_today: false }] };
    }
    if (normalized.includes("from recovery_checkins")) return { rows: [] };
    if (normalized.includes("from daily_coaching_decisions") && normalized.startsWith("select id")) return { rows: [] };
    if (normalized.startsWith("insert into daily_coaching_decisions")) {
      if (options.failDecisionWrite) throw new Error("decision_store_unavailable");
      return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }] };
    }
    throw new Error(`Unexpected query in Today priority route test: ${normalized.slice(0, 120)}`);
  });
}

describe("daily coaching decision route", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { aiRouter } = await import("../routes/ai");
    const app = express();
    app.use(express.json());
    app.use(aiRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    queryMock.mockReset();
    refineMock.mockReset();
    isPlatformOwner = true;
  });

  afterAll(async () => closeServer?.());

  it("uses the member's local calendar day and returns the owner-pilot decision contract", async () => {
    const timezoneOffsetMinutes = -480;
    configureQueries(timezoneOffsetMinutes);

    const response = await fetch(`${baseUrl}/ai/today-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezoneOffsetMinutes })
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.priority.key).toBe("Movement");
    expect(payload.priority.title).toBe("Choose gentle movement today");
    expect(payload.decision).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      active: true,
      cacheHit: false,
      engineVersion: "daily-coaching-v1"
    });
    expect(refineMock).not.toHaveBeenCalled();
  });

  it("keeps the legacy response contract for a normal member while shadow recording remains background-only", async () => {
    const timezoneOffsetMinutes = -480;
    isPlatformOwner = false;
    configureQueries(timezoneOffsetMinutes);

    const response = await fetch(`${baseUrl}/ai/today-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezoneOffsetMinutes })
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.priority.key).toBe("Movement");
    expect(payload.decision).toBeUndefined();
    await vi.waitFor(() => {
      expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("insert into daily_coaching_decisions"))).toBe(true);
    });
    expect(refineMock).not.toHaveBeenCalled();
  });

  it("falls back to the legacy response instead of failing the dashboard when decision persistence is unavailable", async () => {
    const timezoneOffsetMinutes = -480;
    configureQueries(timezoneOffsetMinutes, { failDecisionWrite: true });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await fetch(`${baseUrl}/ai/today-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezoneOffsetMinutes })
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.priority.key).toBe("Movement");
    expect(payload.decision).toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      "[daily-coaching]",
      expect.objectContaining({ event: "active_fallback", errorMessage: "decision_store_unavailable" })
    );
    errorLog.mockRestore();
  });
});
