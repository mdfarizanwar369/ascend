import { describe, expect, it } from "vitest";
import { isValidTimeZone, userDayUtcBounds, userLocalDateKey } from "../utils/userTime";

describe("user-local calendar boundaries", () => {
  it("uses the configured timezone around Singapore midnight and year changes", () => {
    expect(userLocalDateKey(new Date("2026-12-31T15:59:59Z"), "Asia/Singapore")).toBe("2026-12-31");
    expect(userLocalDateKey(new Date("2026-12-31T16:00:00Z"), "Asia/Singapore")).toBe("2027-01-01");
    const bounds = userDayUtcBounds(new Date("2026-12-31T18:00:00Z"), "Asia/Singapore");
    expect(bounds.dateKey).toBe("2027-01-01");
    expect(bounds.start.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2027-01-01T16:00:00.000Z");
  });

  it("handles the 23-hour spring DST day", () => {
    const bounds = userDayUtcBounds(new Date("2026-03-08T16:00:00Z"), "America/New_York");
    expect(bounds.dateKey).toBe("2026-03-08");
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("handles the 25-hour autumn DST day", () => {
    const bounds = userDayUtcBounds(new Date("2026-11-01T16:00:00Z"), "America/New_York");
    expect(bounds.dateKey).toBe("2026-11-01");
    expect(bounds.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("rejects invalid IANA zones", () => {
    expect(isValidTimeZone("Asia/Singapore")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
