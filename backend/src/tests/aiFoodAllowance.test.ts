import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../db/pool", () => ({
  query: queryMock
}));

describe("AI food scan allowance", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("gives free clients five weekly scans", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: null }] })
      .mockResolvedValueOnce({ rows: [{ used: "0" }] });

    const { getFoodAiAllowance } = await import("../services/aiUsageService");
    await expect(getFoodAiAllowance("00000000-0000-0000-0000-000000000001")).resolves.toMatchObject({
      period: "week",
      limit: 5,
      used: 0,
      remaining: 5
    });
  });

  it("gives premium clients five daily scans", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: "premium" }] })
      .mockResolvedValueOnce({ rows: [{ used: "2" }] });

    const { getFoodAiAllowance } = await import("../services/aiUsageService");
    await expect(getFoodAiAllowance("00000000-0000-0000-0000-000000000002")).resolves.toMatchObject({
      period: "day",
      limit: 5,
      used: 2,
      remaining: 3
    });
  });

  it("blocks a client when the allowance is used", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: "premium" }] })
      .mockResolvedValueOnce({ rows: [{ used: "5" }] });

    const { assertFoodAiAllowance, FoodAiLimitError } = await import("../services/aiUsageService");
    await expect(assertFoodAiAllowance("00000000-0000-0000-0000-000000000003")).rejects.toBeInstanceOf(FoodAiLimitError);
  });

  it("keeps owner accounts unlimited but tracked", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ primary_role: "owner", roles: ["owner", "admin"], active_plan: "free" }] });

    const { getFoodAiAllowance } = await import("../services/aiUsageService");
    await expect(getFoodAiAllowance("00000000-0000-0000-0000-000000000004")).resolves.toMatchObject({
      period: "unlimited",
      limit: null,
      remaining: null
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
