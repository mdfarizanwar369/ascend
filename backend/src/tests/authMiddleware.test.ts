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
});
