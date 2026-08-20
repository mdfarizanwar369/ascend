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

  it("counts only successful scans from the member's local day", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: "premium" }] })
      .mockResolvedValueOnce({ rows: [{ used: "1" }] });

    const { getFoodAiAllowance } = await import("../services/aiUsageService");
    await getFoodAiAllowance(
      "00000000-0000-0000-0000-000000000007",
      -480,
      new Date("2026-08-20T16:30:00.000Z")
    );

    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain("status = 'success'");
    expect(params).toEqual([
      "00000000-0000-0000-0000-000000000007",
      "2026-08-20T16:00:00.000Z"
    ]);
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

  it("gives free users ten Ask Zoe conversations per day", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: null }] })
      .mockResolvedValueOnce({ rows: [{ used: "3" }] });

    const { getCoachZoeAccess } = await import("../services/aiUsageService");
    await expect(getCoachZoeAccess("00000000-0000-0000-0000-000000000005")).resolves.toMatchObject({
      tier: "free",
      premiumDepth: false,
      dailyAskZoeLimit: 10,
      dailyAskZoeUsed: 3,
      dailyAskZoeRemaining: 7
    });
  });

  it("keeps premium Ask Zoe unlimited", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ primary_role: "client", roles: ["client"], active_plan: "premium" }] });

    const { getCoachZoeAccess } = await import("../services/aiUsageService");
    await expect(getCoachZoeAccess("00000000-0000-0000-0000-000000000006")).resolves.toMatchObject({
      tier: "premium",
      premiumDepth: true,
      dailyAskZoeLimit: null,
      dailyAskZoeRemaining: null
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
