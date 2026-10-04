import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), isPlatformOwnerEmail: vi.fn() }));
vi.mock("../db/pool", () => ({ query: mocks.query, pool: {} }));
vi.mock("../services/platformOwnerService", () => ({ isPlatformOwnerEmail: mocks.isPlatformOwnerEmail }));

import { findSiriSessionUser, hashSiriSessionToken, revokeSiriSession } from "../services/siriSessionService";

const token = `ascs_${"A".repeat(43)}`;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.isPlatformOwnerEmail.mockReset();
});

describe("owner Siri sessions", () => {
  it("rejects malformed credentials before reaching the database", async () => {
    expect(hashSiriSessionToken("firebase-token")).toBeNull();
    expect(await findSiriSessionUser("firebase-token")).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("permits only an active session that still belongs to the configured owner", async () => {
    mocks.query.mockResolvedValue({ rows: [{ user_id: "owner-id", email: "owner@example.com" }] });
    mocks.isPlatformOwnerEmail.mockReturnValue(false);
    expect(await findSiriSessionUser(token)).toBeNull();
    mocks.isPlatformOwnerEmail.mockReturnValue(true);
    expect(await findSiriSessionUser(token)).toBe("owner-id");
    expect(mocks.query.mock.calls[0][0]).toContain("s.expires_at > now()");
    expect(mocks.query.mock.calls[0][0]).toContain("u.status = 'active'");
    expect(mocks.query.mock.calls[0][1][0]).toHaveLength(64);
  });

  it("revokes only the presented credential hash", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await revokeSiriSession(token);
    expect(mocks.query.mock.calls[0][0]).toContain("where token_hash = $1");
    expect(mocks.query.mock.calls[0][1][0]).toBe(hashSiriSessionToken(token));
  });
});
