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
});
