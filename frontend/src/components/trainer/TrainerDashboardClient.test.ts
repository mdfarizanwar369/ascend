import { describe, expect, it } from "vitest";
import {
  countActiveToday,
  countHighRiskClients,
  lastActivityFor,
  trainerPriorityCards
} from "./TrainerDashboardClient";

type Client = Parameters<typeof countActiveToday>[0][number];
type Alert = Parameters<typeof countHighRiskClients>[1][number];

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    full_name: "Test Client",
    email: "client@example.com",
    current_plan: "premium",
    compliance_score: 72,
    active_today: false,
    athlete_mode_enabled: false,
    ...overrides
  } as unknown as Client;
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    user_id: "client-1",
    severity: "high",
    message: "No activity for several days.",
    created_at: "2026-08-21T01:00:00.000Z",
    ...overrides
  } as unknown as Alert;
}

describe("trainer dashboard trust signals", () => {
  it("counts actual same-day activity instead of positive Momentum", () => {
    const clients = [
      client({ id: "active", active_today: true, compliance_score: 5 }),
      client({ id: "inactive", active_today: false, compliance_score: 95 })
    ];

    expect(countActiveToday(clients)).toBe(1);
  });

  it("deduplicates a high-risk client and that client's alert", () => {
    const clients = [client({ risk_severity: "high" })];

    expect(countHighRiskClients(clients, [alert()])).toBe(1);
  });

  it("does not turn normal-member alerts into Premium coaching priorities", () => {
    const clients = [client({ current_plan: "free", risk_severity: "high" })];

    expect(countHighRiskClients(clients, [alert()])).toBe(0);
    expect(trainerPriorityCards(clients, [alert()]).needsAttention).toHaveLength(0);
  });

  it("surfaces one priority card per client and preserves the alert reason", () => {
    const priorities = trainerPriorityCards([client({ risk_severity: "high" })], [alert()]);

    expect(priorities.needsAttention).toHaveLength(1);
    expect(priorities.needsAttention[0]).toMatchObject({
      reason: "No activity for several days.",
      alertId: "alert-1"
    });
  });

  it("uses the complete activity timestamp supplied by the backend", () => {
    expect(lastActivityFor(client({
      last_activity_at: "2026-08-21T04:00:00.000Z",
      last_food_logged_at: "2026-08-19T04:00:00.000Z"
    }))).toBe("2026-08-21T04:00:00.000Z");
  });

  it("preserves caution when a provisional muscle reading reaches the trainer dashboard", () => {
    const today = new Date().toISOString().slice(0, 10);
    const provisionalSummary = {
      latestScan: { scanDate: today, machine: "InBody 770", skeletalMuscleMassKg: 33.8, importSource: "manual_entry" },
      previousScan: { scanDate: "2026-07-01", machine: "InBody 770", skeletalMuscleMassKg: 35, importSource: "manual_entry" },
      scanCount: 2,
      derived: { fatFreeMassKg: null, estimatedLeanBodyMassKg: null, ffmi: null, estimatedDailyEnergyNeedsKcal: null, bodyRecompositionIndex: null, rateOfFatLossKgPerWeek: null, rateOfMuscleGainKgPerMonth: null, goalEtaWeeks: null, weeklyProgressPercent: null, monthlyProgressPercent: null },
      dnaScore: { current: 70, previous: 68, change: null, label: "Experimental" },
      trends: [],
      coachAlerts: [],
      insights: [],
      nutritionDataSource: "Profile + Body Scan History",
      comparison: {
        available: true,
        daysBetweenScans: 30,
        sameMachine: true,
        status: "PROVISIONAL",
        confidence: "possible",
        reason: "Same recorded scanner model.",
        headline: "Another scan is needed.",
        measurementNote: "Compare similar conditions.",
        metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "lower", evidenceStatus: "PROVISIONAL", confidence: "possible", meaningful: true, message: "The reading is lower, but another comparable scan is needed." }]
      }
    };
    const priorities = trainerPriorityCards([
      client({ athlete_mode_enabled: true, body_composition_summary: provisionalSummary as never })
    ]);

    expect(priorities.needsAttention[0]).toMatchObject({
      reason: "Muscle reading needs confirmation",
      action: "Compare one more scan under similar conditions before drawing a conclusion."
    });
    expect(priorities.needsAttention[0].score).toBeLessThan(100);
  });
});
