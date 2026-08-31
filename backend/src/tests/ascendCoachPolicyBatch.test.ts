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

  it("evaluates all reads from one policy context and writes one evidence-rich break-glass audit", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow("grant-1")] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      if (sql.includes("insert into ascend_coach_access_audit_events")) return Promise.resolve({ rows: [], rowCount: 1 });
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const actions = ["view_profile", "view_training", "view_nutrition", "view_body", "view_recovery"] as const;
    const result = await authorizeAscendCoachActions(owner, "client-user", actions);
    expect(actions.every((action) => result.decisions[action]?.allowed)).toBe(true);
    const audit = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into ascend_coach_access_audit_events"));
    expect(audit?.[1]).toEqual(["owner-user", "client-user", null, JSON.stringify(actions), "grant-1"]);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("treats an absent/expired break-glass grant as denial and writes no audit", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow(null)] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result = await authorizeAscendCoachActions(owner, "client-user", ["view_body"]);
    expect(result.decisions.view_body).toEqual({ allowed: false, reason: "trainer_role_required" });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("preserves the legacy single-action audit key alongside the batched actions key", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("from users client")) return Promise.resolve({ rows: [policyRow("grant-2")] });
      if (sql.includes("as entitled")) return Promise.resolve({ rows: [{ entitled: false }] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    await authorizeAscendCoachActions(owner, "client-user", ["view_training"]);
    const audit = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into ascend_coach_access_audit_events"));
    expect(audit?.[1]).toEqual(["owner-user", "client-user", "view_training", JSON.stringify(["view_training"]), "grant-2"]);
  });
});
