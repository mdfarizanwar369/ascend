import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const connectionQuery = vi.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("update account_deletion_requests") && normalized.includes("status = 'completed'")) {
      return { rows: [{
        id: "request-1",
        user_id: "user-1",
        email: "member@example.com",
        full_name: "Member",
        primary_role: "client",
        mode: "immediate",
        status: "completed",
        reason_codes: [],
        requested_at: "2026-08-21T00:00:00.000Z",
        processed_at: "2026-08-21T01:00:00.000Z",
        notes: "completed"
      }] };
    }
    return { rows: [] };
  });
  const poolQuery = vi.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from account_deletion_requests adr")) {
      return { rows: [{ request_id: "request-1", user_id: "user-1", firebase_uid: "firebase-1" }] };
    }
    if (normalized.includes("from food_logs") && normalized.includes("union")) {
      return { rows: [{ image_s3_key: "food/photo.jpg" }] };
    }
    return { rows: [] };
  });
  return {
    connectionQuery,
    poolQuery,
    release: vi.fn(),
    revokeRefreshTokens: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    deleteStoredObjects: vi.fn(async () => undefined)
  };
});

vi.mock("../db/pool", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: vi.fn(async () => ({ query: mocks.connectionQuery, release: mocks.release }))
  }
}));
vi.mock("../integrations/firebase", () => ({
  getFirebaseAuth: () => ({ revokeRefreshTokens: mocks.revokeRefreshTokens, deleteUser: mocks.deleteUser })
}));
vi.mock("../integrations/s3", () => ({ deleteStoredObjects: mocks.deleteStoredObjects }));

import { retryPendingImmediateAccountDeletions } from "../services/accountDeletionService";

describe("pending account deletion retry", () => {
  it("finishes a previously interrupted immediate deletion idempotently", async () => {
    const result = await retryPendingImmediateAccountDeletions();

    expect(result).toEqual({ attempted: 1, completed: 1 });
    expect(mocks.deleteUser).toHaveBeenCalledWith("firebase-1");
    expect(mocks.deleteStoredObjects).toHaveBeenCalledWith(["food/photo.jpg"]);
    expect(mocks.connectionQuery).toHaveBeenCalledWith("delete from users where id = $1", ["user-1"]);
  });
});
