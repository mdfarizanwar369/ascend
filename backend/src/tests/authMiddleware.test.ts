import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken, dbQuery } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  dbQuery: vi.fn()
}));

vi.mock("../integrations/firebase", () => ({
  getFirebaseAuth: () => ({ verifyIdToken })
}));

vi.mock("../db/pool", () => ({
  query: dbQuery
}));

vi.mock("../config/env", () => ({
  env: { BOOTSTRAP_OWNER_EMAIL: "owner@example.com" }
}));

import { requireAuth } from "../middleware/auth";

function request() {
  return {
    header: (name: string) => name === "Authorization" ? "Bearer test-token" : undefined
  } as never;
}

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { value: { status } as never, status, json };
}

describe("authentication error boundaries", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    dbQuery.mockReset();
  });

  it("returns 401 only when Firebase rejects the token", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = response();
    const next = vi.fn();

    await requireAuth(request(), res.value, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes database failures to the normal error handler", async () => {
    const databaseError = new Error("database unavailable");
    verifyIdToken.mockResolvedValue({ uid: "firebase-user" });
    dbQuery.mockRejectedValue(databaseError);
    const res = response();
    const next = vi.fn();

    await requireAuth(request(), res.value, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(databaseError);
  });

  it("does not rewrite roles on every request for an established owner", async () => {
    verifyIdToken.mockResolvedValue({ uid: "owner-firebase-user" });
    dbQuery.mockResolvedValue({
      rows: [{
        id: "owner-user",
        firebase_uid: "owner-firebase-user",
        email: "owner@example.com",
        primary_role: "owner",
        status: "active",
        roles: ["owner", "admin"]
      }]
    });
    const req = request() as { user?: { roles: string[] } };
    const res = response();
    const next = vi.fn();

    await requireAuth(req as never, res.value, next);

    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(req.user?.roles).toEqual(expect.arrayContaining(["owner", "admin"]));
    expect(next).toHaveBeenCalledWith();
  });
});
