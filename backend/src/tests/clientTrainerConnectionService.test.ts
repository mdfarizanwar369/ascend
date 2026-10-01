import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn()
}));

vi.mock("../db/pool", () => ({
  pool: {
    connect: mocks.connect,
    query: vi.fn()
  }
}));

const trainer = {
  referral_code_id: "referral-1",
  trainer_id: "trainer-1",
  trainer_user_id: "trainer-user-1",
  trainer_name: "Aisha Tan",
  gym_id: "gym-1",
  workspace_name: "Aisha Coaching",
  subscription_status: "trialing",
  introductory_trial: true
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from referral_codes rc")) return { rows: [trainer], rowCount: 1 };
    if (normalized.includes("select assigned_trainer_id")) return { rows: [{ assigned_trainer_id: null, privileged: false }], rowCount: 1 };
    if (normalized.includes("select count(*)::text")) return { rows: [{ count: "1" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});

describe("client-to-trainer consent and trial limits", () => {
  it("rejects stale consent before opening a transaction", async () => {
    const { connectClientToTrainer } = await import("../services/clientTrainerConnectionService");
    await expect(connectClientToTrainer("client-1", "AISHA-123", "old-policy")).rejects.toMatchObject({ status: 400 });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("connects a consenting client while a trial trainer is below the two-client cap", async () => {
    const { connectClientToTrainer, TRAINER_CONNECTION_CONSENT_VERSION } = await import("../services/clientTrainerConnectionService");
    await expect(connectClientToTrainer("client-1", "aisha-123", TRAINER_CONNECTION_CONSENT_VERSION)).resolves.toEqual({
      trainerId: "trainer-1",
      trainerName: "Aisha Tan",
      workspaceName: "Aisha Coaching"
    });
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("insert into client_trainer_connections"), [
      "client-1", "trainer-1", "referral-1", TRAINER_CONNECTION_CONSENT_VERSION
    ]);
    expect(mocks.clientQuery).toHaveBeenCalledWith("commit");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("blocks a third real client during the introductory trial", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("from referral_codes rc")) return { rows: [trainer], rowCount: 1 };
      if (normalized.includes("select assigned_trainer_id")) return { rows: [{ assigned_trainer_id: null, privileged: false }], rowCount: 1 };
      if (normalized.includes("select count(*)::text")) return { rows: [{ count: "2" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { connectClientToTrainer, TRAINER_CONNECTION_CONSENT_VERSION } = await import("../services/clientTrainerConnectionService");
    await expect(connectClientToTrainer("client-3", "AISHA-123", TRAINER_CONNECTION_CONSENT_VERSION)).rejects.toMatchObject({
      status: 409,
      message: "This trainer has reached the 2-client limit for their current plan."
    });
    expect(mocks.clientQuery).toHaveBeenCalledWith("rollback");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("insert into client_trainer_connections"))).toBe(false);
  });

  it("blocks privileged accounts from joining another gym through a trainer code", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("from referral_codes rc")) return { rows: [trainer], rowCount: 1 };
      if (normalized.includes("select assigned_trainer_id")) return { rows: [{ assigned_trainer_id: null, privileged: true }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { connectClientToTrainer, TRAINER_CONNECTION_CONSENT_VERSION } = await import("../services/clientTrainerConnectionService");
    await expect(connectClientToTrainer("admin-1", "AISHA-123", TRAINER_CONNECTION_CONSENT_VERSION)).rejects.toMatchObject({ status: 403 });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("update users set assigned_trainer_id"))).toBe(false);
  });
});
