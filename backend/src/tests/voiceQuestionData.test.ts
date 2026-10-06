import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), health: vi.fn(), workout: vi.fn(), today: vi.fn()
}));
vi.mock("../db/pool", () => ({ query: mocks.query }));
vi.mock("../services/healthSyncService", () => ({ getHealthSyncSummary: mocks.health }));
vi.mock("../services/iosDailyWorkoutService", () => ({ getIosDailyWorkout: mocks.workout }));
vi.mock("../services/voiceTodayService", () => ({ getVoiceTodayData: mocks.today }));
vi.mock("../services/todayPriorityContextService", () => ({
  buildTodayPriorityDayContext: () => ({
    localDate: "2026-10-04",
    dayStartUtc: new Date("2026-10-03T16:00:00Z"),
    dayEndUtc: new Date("2026-10-04T16:00:00Z")
  })
}));
import { getVoiceQuestionData } from "../services/voiceQuestionService";

const ask = (question: string) => getVoiceQuestionData("owner-id", { question, timezoneOffsetMinutes: -480 });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("Siri answers from the member's records", () => {
  it("uses the existing nutrition calculation for varied calorie questions", async () => {
    mocks.today.mockResolvedValue({ spokenText: "You have 600 calories left." });
    expect((await ask("Can I eat more calories now?")).spokenText).toContain("600 calories left");
    expect(mocks.today).toHaveBeenCalledWith("owner-id", { intent: "calories_remaining", timezoneOffsetMinutes: -480 });
  });

  it("reads the saved Zoe plan without generating or changing a workout", async () => {
    mocks.workout.mockResolvedValue({ workout: { title: "Balanced full body", estimatedDurationMinutes: 45, exercises: [{ name: "Leg press" }, { name: "Dumbbell row" }, { name: "Plank" }] }, completed: false });
    expect((await ask("What is my workout today?")).spokenText).toContain("Balanced full body, about 45 minutes, with 3 exercises");
    expect((await ask("Which exercises are in my workout?")).spokenText).toContain("Leg press, Dumbbell row, Plank");
    expect(mocks.workout).toHaveBeenCalledWith("owner-id");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("answers whether a workout was logged from today's saved activity events", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({ rows: [{ count: 0 }] });
    expect((await ask("Have I logged any workout today?")).spokenText).toBe("Yes, you've logged a workout today.");
    expect((await ask("Did I log a workout today?")).spokenText).toBe("You haven't logged a workout in Ascend today.");
    expect(mocks.query.mock.calls[0][1][0]).toBe("owner-id");
    expect(mocks.workout).not.toHaveBeenCalled();
  });

  it("checks actual Zoe plan completion separately from manual workout logs", async () => {
    mocks.workout.mockResolvedValue({ workout: { title: "Strength" }, completed: false });
    expect((await ask("Did I complete my workout today?")).spokenText).toContain("haven't completed today's Zoe workout");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("answers food and water yes-or-no questions from today's records", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ count: 2 }] }).mockResolvedValueOnce({ rows: [{ count: 0 }] });
    expect((await ask("Have I logged any food today?")).spokenText).toBe("Yes, you've logged food in Ascend today.");
    expect((await ask("Have I logged any water today?")).spokenText).toBe("You haven't logged any water in Ascend today.");
    expect(mocks.query.mock.calls[0][0]).toContain("food_logs");
    expect(mocks.query.mock.calls[1][0]).toContain("water_logs");
  });

  it("gets remaining water from Ascend's existing daily guide", async () => {
    mocks.today.mockResolvedValue({ spokenText: "You have 600 millilitres left to reach today's water guide." });
    expect((await ask("How much more water do I need today?")).spokenText).toContain("600 millilitres left");
    expect(mocks.today).toHaveBeenCalledWith("owner-id", { intent: "water_remaining", timezoneOffsetMinutes: -480 });
  });

  it("uses logged workout calories rather than synced active calories for a workout burn question", async () => {
    mocks.query.mockResolvedValue({ rows: [{ calories: "275.4" }] });
    expect((await ask("How many calories did I burn in my workout?")).spokenText).toContain("275 calories burned in workouts today");
    expect(mocks.query.mock.calls[0][0]).toContain("caloriesBurned");
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("reads weight only for the signed-in owner", async () => {
    mocks.query.mockResolvedValue({ rows: [{ latest_weight_kg: "73.5", starting_weight_kg: "78", target_weight_kg: "70", goal_type: "fat_loss" }] });
    expect((await ask("What is my latest weight?")).spokenText).toContain("73.5 kilograms");
    expect(mocks.query.mock.calls[0][1]).toEqual(["owner-id"]);
  });

  it("labels a starting weight honestly when no new weight has been logged", async () => {
    mocks.query.mockResolvedValue({ rows: [{ latest_weight_kg: null, starting_weight_kg: "78", target_weight_kg: "70", goal_type: "fat_loss" }] });
    expect((await ask("What is my latest weight?")).spokenText).toContain("starting weight is 78 kilograms");
    expect((await ask("How much weight have I lost?")).spokenText).toContain("need a starting weight and a weight log");
  });

  it("lists today's actual food names rather than guessing what was eaten", async () => {
    mocks.query.mockResolvedValue({ rows: [{ estimated_food_name: "Eggs" }, { estimated_food_name: "Oatmeal" }] });
    expect((await ask("What did I eat today?")).spokenText).toContain("Eggs, Oatmeal");
    expect(mocks.query.mock.calls[0][1][0]).toBe("owner-id");
  });

  it("does not invent step data when iPhone activity sync is unavailable", async () => {
    mocks.health.mockResolvedValue(null);
    expect((await ask("How many steps today?")).spokenText).toContain("isn't syncing activity from this iPhone");
  });

  it("does not query private records for unknown or unsupported time periods", async () => {
    expect((await ask("What's the weather?")).intent).toBe("unsupported");
    expect((await ask("How many calories yesterday?")).intent).toBe("unsupported_period");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.today).not.toHaveBeenCalled();
  });
});
