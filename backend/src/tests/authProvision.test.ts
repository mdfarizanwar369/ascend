import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({
  dbQuery: vi.fn()
}));

vi.mock("../db/pool", () => ({
  query: dbQuery
}));

vi.mock("../config/env", () => ({
  env: { BOOTSTRAP_OWNER_EMAIL: "owner@example.com" }
}));

import { upsertProvisionedUser } from "../routes/auth";

describe("Google auth provisioning", () => {
  beforeEach(() => {
    dbQuery.mockReset();
  });

  it("adopts an existing user when the email already exists", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "user-1", firebase_uid: "old-firebase-uid", email: "member@example.com" }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "user-1",
          firebase_uid: "new-firebase-uid",
          email: "member@example.com",
          full_name: "Member Name"
        }]
      });

    const result = await upsertProvisionedUser({
      assignedTrainerId: null,
      currentEmail: "member@example.com",
      firebaseUid: "new-firebase-uid",
      fullName: "Member Name",
      gymId: null,
      isBootstrapOwner: false,
      primaryRole: "client",
      referredByGymId: null,
      referredByTrainerId: null
    });

    expect(result.isExistingUser).toBe(true);
    expect(result.user.id).toBe("user-1");
    expect(dbQuery).toHaveBeenNthCalledWith(
      2,
      "select id, firebase_uid, email from users where lower(email) = lower($1) limit 1",
      ["member@example.com"]
    );
    expect(dbQuery.mock.calls[2]?.[0]).toContain("update users");
    expect(dbQuery.mock.calls[2]?.[1]).toEqual([
      "user-1",
      "new-firebase-uid",
      "member@example.com",
      "Member Name",
      false,
      null,
      null,
      null,
      null
    ]);
  });

  it("inserts a new user when neither firebase uid nor email exists", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "user-2",
          firebase_uid: "firebase-uid",
          email: "new@example.com",
          full_name: "New Member"
        }]
      });

    const result = await upsertProvisionedUser({
      assignedTrainerId: null,
      currentEmail: "new@example.com",
      firebaseUid: "firebase-uid",
      fullName: "New Member",
      gymId: null,
      isBootstrapOwner: false,
      primaryRole: "client",
      referredByGymId: null,
      referredByTrainerId: null
    });

    expect(result.isExistingUser).toBe(false);
    expect(result.user.id).toBe("user-2");
    expect(dbQuery.mock.calls[2]?.[0]).toContain("insert into users");
  });
});
