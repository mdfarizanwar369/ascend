import { describe, expect, it } from "vitest";
import { calculateTodayRecoverySignal, combineTodayActivityCalories } from "@ascend/shared";

describe("Today experience signals", () => {
  it("does not mark recovery complete just because poor sleep was recorded", () => {
    const signal = calculateTodayRecoverySignal({
      waterMl: 800,
      waterTargetMl: 2_500,
      sleepQuality: "poor"
    });

    expect(signal.done).toBe(false);
    expect(signal.progress).toBe(32);
  });

  it("accepts a genuinely positive recovery signal", () => {
    expect(calculateTodayRecoverySignal({ waterMl: 500, waterTargetMl: 2_500, sleepQuality: "good" }).done).toBe(true);
    expect(calculateTodayRecoverySignal({ waterMl: 2_500, waterTargetMl: 2_500, sleepQuality: "poor" }).done).toBe(true);
  });

  it("uses the strongest activity calorie source without double counting", () => {
    expect(combineTodayActivityCalories(220, 240)).toBe(240);
    expect(combineTodayActivityCalories(310, 240)).toBe(310);
  });
});
