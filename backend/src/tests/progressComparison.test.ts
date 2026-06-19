import { describe, expect, it } from "vitest";
import { buildProgressComparison } from "../services/progressComparisonService";

describe("progress comparison", () => {
  it("celebrates goal-aligned improvements without creating a leaderboard", () => {
    const comparison = buildProgressComparison({
      goal_type: "fat_loss",
      days_tracked: 45,
      current_weight_kg: 80,
      baseline_weight_kg: 84,
      current_momentum: 78,
      baseline_momentum: 41,
      current_checkin_days: 6,
      baseline_checkin_days: 2
    });

    expect(comparison.hasComparison).toBe(true);
    expect(comparison.highlights).toHaveLength(3);
    expect(comparison.highlights.map((item) => item.message).join(" ")).toContain("4.0kg closer");
    expect(comparison.highlights.map((item) => item.message).join(" ")).toContain("37 points");
    expect(comparison.highlights.map((item) => item.message).join(" ")).not.toContain("other users");
  });

  it("keeps new-client empty states encouraging", () => {
    const comparison = buildProgressComparison({ days_tracked: 12, current_checkin_days: 3, baseline_checkin_days: 0 });
    expect(comparison.hasComparison).toBe(false);
    expect(comparison.highlights).toHaveLength(0);
  });

  it("does not call weight gain a win for a fat-loss goal", () => {
    const comparison = buildProgressComparison({
      goal_type: "fat_loss",
      days_tracked: 45,
      current_weight_kg: 85,
      baseline_weight_kg: 84,
      current_checkin_days: 4,
      baseline_checkin_days: 4
    });
    expect(comparison.highlights.some((item) => item.key === "weight")).toBe(false);
    expect(comparison.highlights[0].message).toContain("Every check-in");
  });
});
