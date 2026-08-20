import { describe, expect, it } from "vitest";
import { summarizeWaterRows } from "../routes/ai";

describe("hydration summary", () => {
  it("reports the newest local day even when database rows are unordered", () => {
    const summary = summarizeWaterRows([
      { logged_at: "2026-08-19T08:00:00.000Z", amount_ml: 500 },
      { logged_at: "2026-08-21T02:00:00.000Z", amount_ml: 700 },
      { logged_at: "2026-08-20T03:00:00.000Z", amount_ml: 1_000 },
      { logged_at: "2026-08-21T04:00:00.000Z", amount_ml: 800 }
    ], -480);

    expect(summary).toEqual({
      daysTracked: 3,
      goalDays: 0,
      averageMl: 1_000,
      latestMl: 1_500
    });
  });
});
