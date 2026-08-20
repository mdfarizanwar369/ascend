import { describe, expect, it } from "vitest";
import { dailyCoachingCorrelation, safeDailyCoachingError } from "../services/dailyCoachingTelemetry";

describe("daily coaching telemetry safety", () => {
  it("does not expose provider or database error messages", () => {
    const error = Object.assign(new Error("secret provider response with member details"), {
      code: "ETIMEDOUT",
      status: 503
    });
    expect(safeDailyCoachingError(error)).toEqual({
      errorName: "Error",
      errorCode: "ETIMEDOUT",
      httpStatus: 503
    });
    expect(JSON.stringify(safeDailyCoachingError(error))).not.toContain("member details");
  });

  it("uses a stable pseudonymous correlation instead of a user id", () => {
    const first = dailyCoachingCorrelation("11111111-1111-4111-8111-111111111111");
    const second = dailyCoachingCorrelation("11111111-1111-4111-8111-111111111111");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain("11111111");
  });
});
