import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), clientQuery:vi.fn(),connect:vi.fn(),release:vi.fn() }));
vi.mock("../db/pool", () => ({ query: mocks.query,pool:{ connect:mocks.connect } }));

import { findSiriSessionUser,hashSiriSessionToken,issueSiriSession,revokeSiriSession } from "../services/siriSessionService";

const token = `ascs_${"A".repeat(43)}`;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.clientQuery.mockReset().mockResolvedValue({ rows:[] });
  mocks.release.mockReset();
  mocks.connect.mockReset().mockResolvedValue({ query:mocks.clientQuery,release:mocks.release });
});

describe("Siri sessions", () => {
  it("rejects malformed credentials before reaching the database", async () => {
    expect(hashSiriSessionToken("firebase-token")).toBeNull();
    expect(await findSiriSessionUser("firebase-token")).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("permits a valid session only while its Ascend account is active", async () => {
    mocks.query.mockResolvedValue({ rows: [{ user_id: "member-id" }] });
    expect(await findSiriSessionUser(token)).toBe("member-id");
    expect(mocks.query.mock.calls[0][0]).toContain("s.expires_at > now()");
    expect(mocks.query.mock.calls[0][0]).toContain("u.status = 'active'");
    expect(mocks.query.mock.calls[0][1][0]).toHaveLength(64);
  });

  it("issues independent device sessions and prunes old credentials",async () => {
    const issued=await issueSiriSession("member-id");
    expect(issued.token).toMatch(/^ascs_[A-Za-z0-9_-]{43}$/);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now()+29*24*60*60_000);
    expect(mocks.clientQuery.mock.calls.map(call => call[0])).toEqual([
      "begin",
      expect.stringContaining("delete from siri_owner_sessions"),
      expect.stringContaining("insert into siri_owner_sessions"),
      expect.stringContaining("offset $2"),
      "commit"
    ]);
    expect(mocks.clientQuery.mock.calls[3][1]).toEqual(["member-id",5]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("revokes only the presented credential hash", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await revokeSiriSession(token);
    expect(mocks.query.mock.calls[0][0]).toContain("where token_hash = $1");
    expect(mocks.query.mock.calls[0][1][0]).toBe(hashSiriSessionToken(token));
  });
});
