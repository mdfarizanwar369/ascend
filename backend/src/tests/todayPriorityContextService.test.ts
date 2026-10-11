import type { DailyActivitySummary } from "@ascend/shared";
import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query:vi.fn(),
  activity:vi.fn(),
  legacy:vi.fn(),
  nutrition:vi.fn()
}));

vi.mock("../db/pool",() => ({ query:mocks.query }));
vi.mock("../services/healthActivityService",() => ({ getDailyHealthActivity:mocks.activity }));
vi.mock("../services/healthSyncService",() => ({ getHealthSyncSummary:mocks.legacy }));
vi.mock("../services/nutritionTargetService",() => ({ resolveNutritionTargets:mocks.nutrition }));

import { loadTodayPriorityFacts,resolveTodayMovementFacts } from "../services/todayPriorityContextService";

function appleSummary(overrides: Partial<DailyActivitySummary> = {}): DailyActivitySummary {
  return {
    day:"2026-10-11",timezone:"Asia/Singapore",provider:"apple_health",steps:7_241,
    providerActiveCalories:321,manualActiveCalories:0,displayedCalories:321,energyBasis:"active",
    coverage:"provider_daily",workoutCount:1,workoutCountAmbiguous:false,
    observedAt:"2026-10-11T07:00:00.000Z",excludedManual:[],manualAdjustments:[],ruleVersion:"daily-active-v1",
    ...overrides
  };
}

const legacySummary = {
  connected:true,todaySteps:99,averageSteps7d:100,todayActiveCalories:12,workoutsThisWeek:0,
  workoutCompletedToday:false,latestWorkoutAt:null,lastSyncedAt:"2026-10-11T06:00:00.000Z"
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nutrition.mockResolvedValue({ calories:2_000,proteinG:125,carbsG:220,fatG:65,waterMl:2_500 });
  mocks.query.mockImplementation(async (sql:string) => {
    const normalized=sql.replace(/\s+/g," ");
    if (normalized.includes("from food_logs")) return { rows:[{ meals:1,protein_g:30 }] };
    if (normalized.includes("from water_logs")) return { rows:[{ water_ml:500 }] };
    if (normalized.includes("from analytics_events")) return { rows:[{ latest_at:null,completed_today:false }] };
    if (normalized.includes("from recovery_checkins")) return { rows:[] };
    throw new Error(`Unexpected query: ${normalized}`);
  });
});

describe("today movement source selection",() => {
  it("uses the private Apple Health ledger instead of the legacy Health Connect summary",async () => {
    mocks.activity.mockResolvedValue(appleSummary());
    mocks.legacy.mockResolvedValue(legacySummary);

    const result=await loadTodayPriorityFacts("member",-480,Date.parse("2026-10-11T08:00:00.000Z"));

    expect(mocks.activity).toHaveBeenCalledWith("member");
    expect(result.facts).toMatchObject({
      stepsToday:7_241,stepsAvailable:true,activeCaloriesToday:321,workoutCompletedToday:true,daysSinceWorkout:0
    });
  });

  it("preserves measured zero and does not substitute legacy values",() => {
    expect(resolveTodayMovementFacts(appleSummary({ steps:0,displayedCalories:0,workoutCount:0,observedAt:null }),legacySummary))
      .toMatchObject({ stepsToday:0,stepsAvailable:true,activeCaloriesToday:0,workoutCompletedToday:false });
  });

  it("keeps unavailable Apple Health steps distinct from zero",() => {
    expect(resolveTodayMovementFacts(appleSummary({ steps:null,displayedCalories:null,workoutCount:0,observedAt:null }),legacySummary))
      .toMatchObject({ stepsToday:0,stepsAvailable:false,activeCaloriesToday:0,workoutCompletedToday:false });
  });

  it("retains the legacy Health Connect path when no private activity ledger exists",() => {
    expect(resolveTodayMovementFacts(null,legacySummary)).toMatchObject({
      stepsToday:99,stepsAvailable:true,activeCaloriesToday:12,workoutCompletedToday:false
    });
  });
});
