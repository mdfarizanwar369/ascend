import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/pool", () => ({ query: mocks.query }));
vi.mock("../config/env", () => ({ env: { ASCEND_COACH_V1: true } }));

import type { AuthUser } from "../middleware/auth";
import { authorizeAscendCoachActions } from "../services/ascendCoachPolicyService";

const owner: AuthUser = {
  id: "owner-user",
  firebaseUid: "owner-firebase",
  email: "owner@example.com",
  primaryRole: "owner",
  roles: ["owner", "admin"],
  isPlatformOwner: true
};

function policyRow(grantId: string | null) {
  return {
    client_id: "client-user",
    client_status: "active",
    has_client_capability: true,
    trainer_profile_id: null,
    trainer_status: null,
    relationship_id: null,
    relationship_status: null,
    data_scopes: null,
    is_primary_programming_authority: null,
    authorization_version: null,
    break_glass_grant_id: grantId
  };
}

describe("Ascend Coach batched authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluates all reads from one policy context and writes one owner-read audit", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow("grant-1")] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      if (sql.includes("insert into ascend_coach_access_audit_events")) return Promise.resolve({ rows: [], rowCount: 1 });
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const actions = ["view_profile", "view_training", "view_nutrition", "view_body", "view_recovery"] as const;
    const result = await authorizeAscendCoachActions(owner, "client-user", actions);
    expect(actions.every((action) => result.decisions[action]?.allowed)).toBe(true);
    expect(result.platformOwnerAccess).toBe(true);
    const audit = mocks.query.mock.calls.find(([sql]) => String(sql).includes("platform_owner_client_read"));
    expect(audit?.[1]).toEqual(["owner-user", "client-user", JSON.stringify(actions)]);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("does not require a break-glass grant for the true Platform Owner", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow(null)] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      if (sql.includes("platform_owner_client_read")) return Promise.resolve({ rows: [], rowCount: 1 });
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result = await authorizeAscendCoachActions(owner, "client-user", ["view_body"]);
    expect(result.decisions.view_body).toMatchObject({ allowed: true, platformOwnerAccess: true });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("writes the exact single owner action and does not grant mutations", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow("grant-2")] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const result = await authorizeAscendCoachActions(owner, "client-user", ["view_training", "manage_notes", "assign_program"]);
    const audit = mocks.query.mock.calls.find(([sql]) => String(sql).includes("platform_owner_client_read"));
    expect(audit?.[1]).toEqual(["owner-user", "client-user", JSON.stringify(["view_training"])]);
    expect(result.decisions.manage_notes?.allowed).toBe(false);
    expect(result.decisions.assign_program?.allowed).toBe(false);
  });
});
