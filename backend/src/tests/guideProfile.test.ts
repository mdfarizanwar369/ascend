import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../db/pool", () => ({
  query: queryMock
}));

describe("guide profile", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("updates the fields used for daily nutrition guides", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "user-1",
          gender: "male",
          age_years: 35,
          activity_level: "moderate",
          height_cm: 175
        }
      ]
    });

    const { updateGuideProfile } = await import("../services/userService");
    const user = await updateGuideProfile("user-1", {
      gender: "male",
      ageYears: 35,
      activityLevel: "moderate",
      heightCm: 175
    });

    expect(user.age_years).toBe(35);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("activity_level = $4"), ["user-1", "male", 35, "moderate", 175]);
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
      "self_coached"
    ]);
  });
});
