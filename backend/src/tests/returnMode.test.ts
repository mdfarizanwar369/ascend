import { describe, expect, it } from "vitest";
import {
  evaluateReturnModeEligibility,
  RETURN_MODE_COOLDOWN_HOURS,
  RETURN_MODE_MIN_INACTIVITY_HOURS
} from "@ascend/shared";

const now = new Date("2026-08-19T12:00:00.000Z");

function hoursAgo(hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function eligibleInput(overrides: Record<string, unknown> = {}) {
  return {
    featureEnabled: true,
    authResolved: true,
    profileResolved: true,
    status: "active",
    primaryRole: "client" as const,
    roles: ["client" as const],
    goalType: "fat_loss",
    startingWeightKg: 74,
    lastMeaningfulActivityAt: hoursAgo(RETURN_MODE_MIN_INACTIVITY_HOURS),
    returnModeLastShownAt: null,
    returnModeShownForActivityAt: null,
    ...overrides
  };
}

describe("Return Mode eligibility", () => {
  it("fails closed when the feature flag is disabled", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ featureEnabled: false }), now)).toEqual({
      eligible: false,
      reason: "feature_disabled"
    });
  });

  it("does not treat a new or legacy user with no activity timestamp as inactive", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: null }), now)).toEqual({
      eligible: false,
      reason: "activity_missing"
    });
  });

  it("requires completed onboarding", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ goalType: null }), now)).toMatchObject({ reason: "onboarding_incomplete" });
    expect(evaluateReturnModeEligibility(eligibleInput({ startingWeightKg: null }), now)).toMatchObject({ reason: "onboarding_incomplete" });
  });

  it("fails closed when authentication or profile data is unresolved", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ authResolved: false }), now)).toMatchObject({ reason: "auth_unresolved" });
    expect(evaluateReturnModeEligibility(eligibleInput({ profileResolved: false }), now)).toMatchObject({ reason: "profile_unresolved" });
  });

  it("rejects missing, malformed, and future activity timestamps", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: "not-a-date" }), now)).toMatchObject({ reason: "activity_invalid" });
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: hoursAgo(-1) }), now)).toMatchObject({ reason: "activity_invalid" });
  });

  it("does not show below five full elapsed days", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: hoursAgo(119.99) }), now)).toMatchObject({ reason: "activity_too_recent" });
  });

  it("shows at exactly 120 elapsed hours", () => {
    expect(evaluateReturnModeEligibility(eligibleInput(), now)).toMatchObject({
      eligible: true,
      inactivityHours: 120,
      inactivityBucket: "5_13_days"
    });
  });

  it("shows above the inactivity threshold", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: hoursAgo(400) }), now)).toMatchObject({
      eligible: true,
      inactivityBucket: "14_29_days"
    });
  });

  it("uses privacy-safe buckets at the fourteen- and thirty-day boundaries", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: hoursAgo(14 * 24) }), now)).toMatchObject({
      eligible: true,
      inactivityBucket: "14_29_days"
    });
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: hoursAgo(30 * 24) }), now)).toMatchObject({
      eligible: true,
      inactivityBucket: "30_plus_days"
    });
  });

  it("does not show twice for the same activity episode", () => {
    const activity = hoursAgo(200);
    expect(evaluateReturnModeEligibility(eligibleInput({
      lastMeaningfulActivityAt: activity,
      returnModeShownForActivityAt: activity,
      returnModeLastShownAt: hoursAgo(100)
    }), now)).toMatchObject({ reason: "episode_already_shown" });
  });

  it("allows a future episode after a new meaningful activity and satisfied cooldown", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({
      lastMeaningfulActivityAt: hoursAgo(130),
      returnModeShownForActivityAt: hoursAgo(600),
      returnModeLastShownAt: hoursAgo(RETURN_MODE_COOLDOWN_HOURS)
    }), now)).toMatchObject({ eligible: true });
  });

  it("enforces the fourteen-day cooldown", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({
      returnModeShownForActivityAt: hoursAgo(800),
      returnModeLastShownAt: hoursAgo(RETURN_MODE_COOLDOWN_HOURS - 0.01)
    }), now)).toMatchObject({ reason: "cooldown_active" });
  });

  it("allows a new episode at the exact cooldown boundary", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({
      returnModeShownForActivityAt: hoursAgo(800),
      returnModeLastShownAt: hoursAgo(RETURN_MODE_COOLDOWN_HOURS)
    }), now)).toMatchObject({ eligible: true });
  });

  it("rejects inactive accounts and non-member role combinations", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ status: "inactive" }), now)).toMatchObject({ reason: "account_inactive" });
    expect(evaluateReturnModeEligibility(eligibleInput({ roles: ["client", "trainer"] }), now)).toMatchObject({ reason: "not_member" });
  });

  it("treats equivalent timezone timestamps as the same elapsed boundary", () => {
    const singaporeBoundary = "2026-08-14T20:00:00.000+08:00";
    expect(evaluateReturnModeEligibility(eligibleInput({ lastMeaningfulActivityAt: singaporeBoundary }), now)).toMatchObject({
      eligible: true,
      inactivityHours: 120
    });
  });

  it("fails closed for invalid episode timestamps", () => {
    expect(evaluateReturnModeEligibility(eligibleInput({ returnModeShownForActivityAt: "invalid" }), now)).toMatchObject({ reason: "shown_timestamp_invalid" });
    expect(evaluateReturnModeEligibility(eligibleInput({ returnModeLastShownAt: "invalid" }), now)).toMatchObject({ reason: "shown_timestamp_invalid" });
  });
});
