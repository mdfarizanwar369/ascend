import { describe, expect, it } from "vitest";
import {
  localDateKeyAtOffset,
  localDayStartUtc,
  localWeekStartUtc,
  normalizeTimezoneOffsetMinutes
} from "../services/memberTimeService";

describe("member local time boundaries", () => {
  it("uses the member's Singapore date around UTC midnight", () => {
    const now = new Date("2026-08-20T16:30:00.000Z");

    expect(localDateKeyAtOffset(now, -480)).toBe("2026-08-21");
    expect(localDayStartUtc(-480, now).toISOString()).toBe("2026-08-20T16:00:00.000Z");
  });

  it("starts the member's week on local Monday", () => {
    const now = new Date("2026-08-23T20:30:00.000Z");

    expect(localDateKeyAtOffset(now, -480)).toBe("2026-08-24");
    expect(localWeekStartUtc(-480, now).toISOString()).toBe("2026-08-23T16:00:00.000Z");
  });

  it("clamps invalid or unsafe timezone offsets", () => {
    expect(normalizeTimezoneOffsetMinutes("not-a-number")).toBe(0);
    expect(normalizeTimezoneOffsetMinutes(-1_000)).toBe(-840);
    expect(normalizeTimezoneOffsetMinutes(1_000)).toBe(840);
  });
});
