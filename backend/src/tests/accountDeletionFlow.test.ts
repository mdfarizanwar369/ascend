import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const connectionQuery = vi.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized === "begin") events.push("begin");
    if (normalized === "commit") events.push("commit");
    if (normalized === "rollback") events.push("rollback");
    if (normalized.includes("from account_deletion_requests") && normalized.includes("status = 'requested'")) return { rows: [] };
    if (normalized.includes("from food_logs") && normalized.includes("union")) return { rows: [{ image_s3_key: "food/photo.jpg" }] };
    if (normalized.includes("insert into account_deletion_requests")) {
      events.push("request-recorded");
      return { rows: [{
        id: "request-1",
        user_id: "user-1",
        email: "member@example.com",
        full_name: "Member",
        primary_role: "client",
        mode: "immediate",
        status: "requested",
        reason_codes: [],
        requested_at: "2026-08-21T00:00:00.000Z",
        processed_at: null,
        notes: "pending"
      }] };
    }
    if (normalized.startsWith("update account_deletion_requests") && normalized.includes("status = 'completed'")) {
      events.push("request-completed");
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
        processed_at: "2026-08-21T00:01:00.000Z",
        notes: "completed"
      }] };
    }
    if (normalized.startsWith("update users set status = 'inactive'")) events.push("user-disabled");
    if (normalized.startsWith("delete from users")) events.push("user-deleted");
    return { rows: [] };
  });
  return {
    events,
    connectionQuery,
    poolQuery: vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("from food_logs") && normalized.includes("union")) {
        return { rows: [{ image_s3_key: "food/photo.jpg" }] };
      }
      return { rows: [{
        id: "user-1",
        firebase_uid: "firebase-1",
        email: "member@example.com",
        full_name: "Member",
        primary_role: "client",
        status: "active",
        trainer_id: null,
        roles: ["client"],
        has_live_paid_subscription: false
      }] };
    }),
    release: vi.fn(),
    revokeRefreshTokens: vi.fn(async () => { events.push("firebase-revoked"); }),
    deleteUser: vi.fn(async () => { events.push("firebase-deleted"); }),
    deleteStoredObjects: vi.fn(async () => { events.push("media-deleted"); })
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

import { submitSelfAccountDeletion } from "../services/accountDeletionService";

describe("self account deletion execution", () => {
  it("commits the durable disabled state before deleting external identity or media", async () => {
    const result = await submitSelfAccountDeletion("user-1", { isPlatformOwner: false });

    const firstCommit = mocks.events.indexOf("commit");
    expect(firstCommit).toBeGreaterThan(mocks.events.indexOf("user-disabled"));
    expect(firstCommit).toBeLessThan(mocks.events.indexOf("firebase-deleted"));
    expect(firstCommit).toBeLessThan(mocks.events.indexOf("media-deleted"));
    expect(mocks.events.indexOf("request-completed")).toBeLessThan(mocks.events.indexOf("user-deleted"));
    expect(result.outcome).toBe("deleted");
  });
});
