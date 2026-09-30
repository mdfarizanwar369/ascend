import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => vi.fn());
vi.mock("../db/pool", () => ({ query: db }));

beforeEach(() => {
  vi.clearAllMocks();
  db.mockImplementation(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select email, full_name")) {
      return { rows: [{ email: "aisha@example.com", full_name: "Aisha Tan", primary_role: "client" }], rowCount: 1 };
    }
    if (normalized.startsWith("select id from trainers")) return { rows: [], rowCount: 0 };
    if (normalized.startsWith("select mode, workspace_name")) {
      return { rows: [{ mode: "independent", workspace_name: "Aisha Coaching", country: "Malaysia", timezone: "Asia/Kuala_Lumpur", trainer_invitation_id: null }], rowCount: 1 };
    }
    if (normalized.startsWith("insert into gyms")) return { rows: [{ id: "gym-1" }], rowCount: 1 };
    if (normalized.startsWith("insert into trainers")) return { rows: [{ id: "trainer-1" }], rowCount: 1 };
    if (normalized.includes("select t.id as trainer_id")) {
      return { rows: [{ trainer_id: "trainer-1", full_name: "Aisha Tan" }], rowCount: 1 };
    }
    if (normalized.startsWith("select code from referral_codes")) return { rows: [], rowCount: 0 };
    if (normalized.startsWith("insert into referral_codes")) return { rows: [{ code: "AISHA-ABC123" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});

describe("Trainer Pro workspace activation", () => {
  it("creates an independent workspace and referral after verified entitlement", async () => {
    const { activateTrainerWorkspaceForEntitlement } = await import("../services/trainerOnboardingService");
    await expect(activateTrainerWorkspaceForEntitlement("user-1")).resolves.toEqual({
      trainerId: "trainer-1",
      referralCode: "AISHA-ABC123"
    });

    expect(db.mock.calls.some(([sql, values]) => String(sql).includes("insert into gyms") && values[0] === "Aisha Coaching")).toBe(true);
    expect(db).toHaveBeenCalledWith(expect.stringContaining("insert into user_roles"), ["user-1"]);
    expect(db.mock.calls.some(([sql]) => String(sql).includes("insert into trainer_onboarding_intents"))).toBe(true);
  });
});
