import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compliance: vi.fn(),
  riskAlerts: vi.fn(),
  homework: vi.fn(),
  coachingCleanup: vi.fn(),
  deletionRetry: vi.fn()
}));

vi.mock("../jobs/complianceJob", () => ({ calculateDailyComplianceScores: mocks.compliance }));
vi.mock("../jobs/riskAlertJob", () => ({ generateRiskAlerts: mocks.riskAlerts }));
vi.mock("../services/trainerHomeworkService", () => ({ sendHomeworkDueNotifications: mocks.homework }));
vi.mock("../services/dailyCoachingDecisionService", () => ({ cleanupExpiredDailyCoachingDecisions: mocks.coachingCleanup }));
vi.mock("../services/accountDeletionService", () => ({ retryPendingImmediateAccountDeletions: mocks.deletionRetry }));

import { runDailyJobs } from "../jobs/runDailyJobs";

describe("daily job isolation", () => {
  it("still retries pending account deletion when an earlier job fails", async () => {
    const complianceError = new Error("compliance unavailable");
    mocks.compliance.mockRejectedValueOnce(complianceError);
    mocks.deletionRetry.mockResolvedValueOnce({ attempted: 1, completed: 1 });

    await expect(runDailyJobs()).rejects.toBe(complianceError);
    expect(mocks.deletionRetry).toHaveBeenCalledTimes(1);
  });
});
