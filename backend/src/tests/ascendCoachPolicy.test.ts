import { describe, expect, it } from "vitest";
import {
  ASCEND_COACH_DATA_SCOPES,
  AscendCoachPolicyContext,
  authorizationCacheKey,
  evaluateAscendCoachPolicy,
  isAscendCoachShellEligible
} from "../services/ascendCoachPolicyService";
import { isEligibleCoachInviteTarget } from "../services/ascendCoachRelationshipService";

function context(overrides: Partial<AscendCoachPolicyContext> = {}): AscendCoachPolicyContext {
  return {
    featureEnabled: true,
    actor: {
      id: "trainer-user",
      primaryRole: "trainer",
      roles: ["trainer"],
      trainerId: "trainer-profile",
      isPlatformOwner: false
    },
    client: { id: "client-user", status: "active", hasClientCapability: true },
    trainerProfile: { id: "trainer-profile", status: "active" },
    entitled: true,
    relationship: {
      id: "relationship-1",
      status: "active",
      dataScopes: [...ASCEND_COACH_DATA_SCOPES],
      isPrimaryProgrammingAuthority: true,
      authorizationVersion: 4
    },
    breakGlassGrant: null,
    ...overrides
  };
}

describe("Ascend Coach authorization matrix", () => {
  it("limits shell eligibility to trainers and the authenticated Platform Owner", () => {
    expect(isAscendCoachShellEligible(context().actor)).toBe(true);
    expect(isAscendCoachShellEligible({ primaryRole: "client", roles: ["client"], isPlatformOwner: false })).toBe(false);
    expect(isAscendCoachShellEligible({ primaryRole: "admin", roles: ["admin"], isPlatformOwner: false })).toBe(false);
    expect(isAscendCoachShellEligible({ primaryRole: "owner", roles: ["owner", "admin"], isPlatformOwner: false })).toBe(false);
    expect(isAscendCoachShellEligible({ primaryRole: "owner", roles: ["owner", "admin"], isPlatformOwner: true })).toBe(true);
  });

  it("allows an entitled active trainer only through an active scoped relationship", () => {
    expect(evaluateAscendCoachPolicy(context(), "view_training")).toMatchObject({
      allowed: true,
      relationshipId: "relationship-1",
      authorizationVersion: 4
    });
  });

  it("blocks a wrong trainer with no relationship", () => {
    expect(evaluateAscendCoachPolicy(context({ relationship: null }), "view_profile")).toEqual({
      allowed: false,
      reason: "relationship_required"
    });
  });

  it("blocks invited, revoked, and suspended relationships", () => {
    for (const status of ["invited", "revoked_by_client", "suspended"]) {
      expect(evaluateAscendCoachPolicy(context({
        relationship: { ...context().relationship!, status }
      }), "view_training")).toEqual({ allowed: false, reason: "relationship_inactive" });
    }
  });

  it("blocks inactive and pending trainer profiles", () => {
    for (const status of ["inactive", "pending"]) {
      expect(evaluateAscendCoachPolicy(context({
        trainerProfile: { id: "trainer-profile", status }
      }), "view_profile")).toEqual({ allowed: false, reason: "trainer_inactive" });
    }
  });

  it("requires a trainer profile, trainer role, and entitlement", () => {
    expect(evaluateAscendCoachPolicy(context({ trainerProfile: null }), "view_profile").reason).toBe("trainer_profile_required");
    expect(evaluateAscendCoachPolicy(context({
      actor: { ...context().actor, primaryRole: "client", roles: ["client"] }
    }), "view_profile").reason).toBe("trainer_role_required");
    expect(evaluateAscendCoachPolicy(context({ entitled: false }), "view_profile").reason).toBe("coach_entitlement_required");
  });

  it("supports a trainer-as-client multi-role account", () => {
    const decision = evaluateAscendCoachPolicy(context({
      actor: { ...context().actor, primaryRole: "client", roles: ["client", "trainer"] }
    }), "view_training");
    expect(decision.allowed).toBe(true);
  });

  it("requires the exact requested data scope", () => {
    const relationship = { ...context().relationship!, dataScopes: ["profile", "training"] as const };
    expect(evaluateAscendCoachPolicy(context({ relationship: { ...relationship, dataScopes: [...relationship.dataScopes] } }), "view_training").allowed).toBe(true);
    expect(evaluateAscendCoachPolicy(context({ relationship: { ...relationship, dataScopes: [...relationship.dataScopes] } }), "view_nutrition")).toEqual({
      allowed: false,
      reason: "scope_missing"
    });
  });

  it("requires primary authority for program actions but not read actions", () => {
    const relationship = { ...context().relationship!, isPrimaryProgrammingAuthority: false };
    expect(evaluateAscendCoachPolicy(context({ relationship }), "view_training").allowed).toBe(true);
    expect(evaluateAscendCoachPolicy(context({ relationship }), "assign_program")).toEqual({
      allowed: false,
      reason: "primary_programming_authority_required"
    });
  });

  it("does not grant admin or Platform Owner content access by role or owner identity alone", () => {
    const admin = { ...context().actor, primaryRole: "admin" as const, roles: ["admin" as const], trainerId: undefined };
    expect(evaluateAscendCoachPolicy(context({ actor: admin, trainerProfile: null, relationship: null }), "view_body").allowed).toBe(false);

    const owner = { ...admin, primaryRole: "owner" as const, roles: ["owner" as const, "admin" as const], isPlatformOwner: true };
    expect(evaluateAscendCoachPolicy(context({ actor: owner, trainerProfile: null, relationship: null }), "view_body").allowed).toBe(false);
  });

  it("allows a Platform Owner only through a live break-glass grant and only for reads", () => {
    const owner = {
      ...context().actor,
      primaryRole: "owner" as const,
      roles: ["owner" as const, "admin" as const],
      trainerId: undefined,
      isPlatformOwner: true
    };
    const withGrant = context({ actor: owner, trainerProfile: null, relationship: null, breakGlassGrant: { id: "grant-1" } });
    expect(evaluateAscendCoachPolicy(withGrant, "view_nutrition")).toEqual({ allowed: true, breakGlassGrantId: "grant-1" });
    expect(evaluateAscendCoachPolicy(withGrant, "manage_notes").allowed).toBe(false);
    expect(evaluateAscendCoachPolicy(withGrant, "assign_program").allowed).toBe(false);
  });

  it("blocks inactive clients and accounts without client capability", () => {
    expect(evaluateAscendCoachPolicy(context({ client: { id: "client-user", status: "inactive", hasClientCapability: true } }), "view_profile").reason).toBe("client_inactive");
    expect(evaluateAscendCoachPolicy(context({ client: { id: "client-user", status: "active", hasClientCapability: false } }), "view_profile").reason).toBe("client_capability_missing");
  });

  it("defaults to deny when the backend feature flag is off", () => {
    expect(evaluateAscendCoachPolicy(context({ featureEnabled: false }), "view_profile")).toEqual({
      allowed: false,
      reason: "feature_disabled"
    });
  });
});

describe("Ascend Coach relationship boundaries", () => {
  it("rejects cross-gym and self invitations", () => {
    expect(isEligibleCoachInviteTarget({ actorUserId: "trainer", trainerGymId: "gym-a", clientUserId: "client", clientGymId: "gym-b" })).toBe(false);
    expect(isEligibleCoachInviteTarget({ actorUserId: "trainer", trainerGymId: "gym-a", clientUserId: "trainer", clientGymId: "gym-a" })).toBe(false);
  });

  it("accepts a distinct client in the trainer gym", () => {
    expect(isEligibleCoachInviteTarget({ actorUserId: "trainer", trainerGymId: "gym-a", clientUserId: "client", clientGymId: "gym-a" })).toBe(true);
  });

  it("changes authorization cache identity when the relationship version changes", () => {
    const base = { actorUserId: "trainer", clientUserId: "client", action: "view_profile" as const, relationshipId: "relationship" };
    expect(authorizationCacheKey({ ...base, authorizationVersion: 4 })).not.toBe(
      authorizationCacheKey({ ...base, authorizationVersion: 5 })
    );
  });
});
