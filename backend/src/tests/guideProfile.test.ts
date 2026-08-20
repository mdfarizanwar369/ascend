import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../db/pool", () => ({
  query: queryMock
}));

describe("guide profile", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("enforces the published 18+ self-service age requirement", async () => {
    const { guideProfileSchema, onboardingSchema } = await import("../services/userService");

    expect(onboardingSchema.safeParse({
      fullName: "Young Member",
      goalType: "maintenance",
      startingWeightKg: 60,
      ageYears: 17
    }).success).toBe(false);
    expect(guideProfileSchema.safeParse({
      gender: "prefer_not_to_say",
      ageYears: 17,
      activityLevel: "moderate",
      heightCm: 170,
      goalType: "maintenance"
    }).success).toBe(false);
  });

  it("updates the fields used for daily nutrition guides", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "user-1",
          gender: "male",
          age_years: 35,
          activity_level: "moderate",
          height_cm: 175,
          goal_type: "fat_loss",
          target_weight_kg: 80
        }
      ]
    });

    const { updateGuideProfile } = await import("../services/userService");
    const user = await updateGuideProfile("user-1", {
      gender: "male",
      ageYears: 35,
      activityLevel: "moderate",
      heightCm: 175,
      goalType: "fat_loss",
      targetWeightKg: 80
    });

    expect(user.age_years).toBe(35);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("goal_version + 1"), ["user-1", "male", 35, "moderate", 175, "fat_loss", 80]);
  });

  it("keeps trainer-referred clients in human coach mode", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "ref-1", gym_id: "gym-1", trainer_id: "trainer-1" }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: "user-1", assigned_trainer_id: "trainer-1", coaching_mode: "human_coach" }]
      });

    const { completeOnboarding } = await import("../services/userService");
    const user = await completeOnboarding("user-1", {
      fullName: "Sally",
      referralCode: "TRAINER-JASON",
      coachingMode: "self_coached",
      goalType: "fat_loss",
      gender: "female",
      ageYears: 30,
      heightCm: 165,
      activityLevel: "moderate",
      startingWeightKg: 75,
      targetWeightKg: 65
    });

    expect(user.coaching_mode).toBe("human_coach");
    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("coalesce(rc.gym_id, t.gym_id)"), ["TRAINER-JASON"]);
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("coaching_mode = case"), [
      "user-1",
      "Sally",
      "fat_loss",
      165,
      75,
      65,
      "female",
      30,
      "moderate",
      "gym-1",
      "trainer-1",
      "self_coached",
      null,
      false,
      null
    ]);
  });

  it("stores onboarding human context without changing the existing profile inputs", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "user-1", primary_barrier: "too_busy", motivation_anchor: "family" }]
    });

    const { completeOnboarding } = await import("../services/userService");
    const user = await completeOnboarding("user-1", {
      fullName: "Sally",
      coachingMode: "self_coached",
      goalType: "fat_loss",
      gender: "female",
      ageYears: 30,
      heightCm: 165,
      activityLevel: "moderate",
      startingWeightKg: 75,
      targetWeightKg: 65,
      primaryBarrier: "too_busy",
      motivationAnchor: "family"
    });

    expect(user).toMatchObject({ primary_barrier: "too_busy", motivation_anchor: "family" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("primary_barrier = coalesce"), [
      "user-1",
      "Sally",
      "fat_loss",
      165,
      75,
      65,
      "female",
      30,
      "moderate",
      null,
      null,
      "self_coached",
      "too_busy",
      true,
      "family"
    ]);
  });

  it("preserves existing human context when an older client omits the new fields", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "user-1" }] });

    const { completeOnboarding } = await import("../services/userService");
    await completeOnboarding("user-1", {
      fullName: "Legacy Member",
      coachingMode: "self_coached",
      goalType: "maintenance",
      startingWeightKg: 75
    });

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain("motivation_anchor = case when $14 then $15 else motivation_anchor end");
    expect(values.slice(-3)).toEqual([null, false, null]);
  });

  it("accepts a skipped motivation anchor and rejects unknown context values", async () => {
    const { onboardingSchema } = await import("../services/userService");
    const base = {
      fullName: "Sally",
      coachingMode: "self_coached" as const,
      goalType: "fat_loss" as const,
      startingWeightKg: 75,
      primaryBarrier: "motivation_loss" as const
    };

    expect(onboardingSchema.parse({ ...base, motivationAnchor: null }).motivationAnchor).toBeNull();
    expect(() => onboardingSchema.parse({ ...base, primaryBarrier: "not-real" })).toThrow();
  });

  it("rejects an invalid onboarding referral instead of silently ignoring it", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const { completeOnboarding } = await import("../services/userService");

    await expect(completeOnboarding("user-1", {
      fullName: "Sally",
      referralCode: "NOT-A-REAL-CODE",
      coachingMode: "self_coached",
      goalType: "fat_loss",
      startingWeightKg: 75
    })).rejects.toThrow("Referral code not found");

    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
