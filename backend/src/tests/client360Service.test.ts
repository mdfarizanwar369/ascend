import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { Client360AccessError, createAscendCoachClient360Service } from "../services/ascendCoachClient360Service";
import * as repository from "../services/client360Repository";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const CLIENT_ID = "10000000-0000-4000-8000-000000000001";
const actor: AuthUser = { id: "trainer-user", firebaseUid: "fb", email: "trainer@example.com", roles: ["trainer"], primaryRole: "trainer", trainerId: "trainer-id", isPlatformOwner: false };
const actions = ["view_profile", "view_training", "view_nutrition", "view_body", "view_recovery"] as const;

function authorization(scopes: string[], overrides: Record<string, unknown> = {}) {
  const scopeFor = { view_profile: "profile", view_training: "training", view_nutrition: "nutrition", view_body: "body", view_recovery: "recovery" } as const;
  return {
    decisions: Object.fromEntries(actions.map((action) => [action, scopes.includes(scopeFor[action]) ? { allowed: true, relationshipId: "relationship", authorizationVersion: 3, dataScopes: scopes } : { allowed: false, reason: "scope_missing" }])),
    relationshipId: "relationship",
    relationshipStatus: "active",
    authorizationVersion: 3,
    breakGlassGrantId: null,
    platformOwnerAccess: false,
    ...overrides
  };
}

function dependencies(auth = authorization(["profile", "training", "nutrition", "body", "recovery"])) {
  const repo = {
    ...repository,
    loadClient360Profile: vi.fn().mockResolvedValue({ id: CLIENT_ID, full_name: "Client A", goal_type: "fat_loss", activity_level: "moderate", created_at: "2026-01-01T00:00:00.000Z" }),
    loadClient360Training: vi.fn().mockResolvedValue({ aggregate: { client_created_at: "2026-01-01T00:00:00.000Z", count_7d: 3, count_30d: 10, count_90d: 25, current_28d: 8, previous_28d: 7, active_weeks_8: 7, last_workout_at: "2026-08-30T00:00:00.000Z", duration_count_30d: 8, average_duration_30d: 50 }, recent: [] }),
    loadClient360NutritionDays: vi.fn().mockResolvedValue([{ logged_date: "2026-08-31", calories: 1800, protein_g: 120, goal_type: "fat_loss" }]),
    loadClient360Weights: vi.fn().mockResolvedValue([]),
    loadClient360BodyScans: vi.fn().mockResolvedValue([]),
    loadClient360Activity: vi.fn().mockResolvedValue({ connected: true, last_synced_at: "2026-08-31T10:00:00.000Z", today_steps: 5000, steps_days_7d: 7, average_steps_7d: 7000, exercise_sessions_7d: 2, last_exercise_session_at: "2026-08-30T10:00:00.000Z" }),
    loadActiveClient360Relationships: vi.fn().mockResolvedValue([]),
    loadAllPlatformOwnerClients: vi.fn().mockResolvedValue([]),
    auditPlatformOwnerClientList: vi.fn().mockResolvedValue(undefined),
    loadClient360ListProfiles: vi.fn().mockResolvedValue([]),
    loadClient360ListWorkoutDates: vi.fn().mockResolvedValue([])
  };
  return {
    authorize: vi.fn().mockResolvedValue(auth),
    canUseWorkspace: vi.fn().mockResolvedValue(true),
    featureEnabled: vi.fn().mockReturnValue(true),
    repo,
    nutritionTargets: vi.fn().mockResolvedValue({ calories: 1800, proteinG: 120, source: "ascend_recommendation" }),
    progressionHistory: vi.fn().mockResolvedValue([])
  };
}

describe("Client 360 service authorization fixtures", () => {
  it("Client A receives a complete deterministic snapshot", async () => {
    const deps = dependencies();
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(snapshot).toMatchObject({ version: "client_360_snapshot_v1", clientId: CLIENT_ID, profile: { displayName: "Client A" } });
    expect(snapshot.training?.completedWorkouts.last7Days).toBe(3);
    expect(snapshot.nutrition?.targetEvaluationBasis).toBe("logged_days_only");
    expect(snapshot.bodyProgress).toBeDefined();
    expect(snapshot.activity).toBeDefined();
    expect(deps.authorize.mock.invocationCallOrder[0]).toBeLessThan(deps.repo.loadClient360Profile.mock.invocationCallOrder[0]);
  });

  it("caps eight-week logging consistency when a 56-day window touches nine calendar weeks", async () => {
    const deps = dependencies();
    deps.repo.loadClient360Training.mockResolvedValue({
      aggregate: {
        client_created_at: "2026-01-01T00:00:00.000Z",
        count_7d: 2,
        count_30d: 9,
        count_90d: 16,
        current_28d: 8,
        previous_28d: 8,
        active_weeks_8: 9,
        last_workout_at: "2026-08-30T00:00:00.000Z",
        duration_count_30d: 9,
        average_duration_30d: 52
      },
      recent: []
    });
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(snapshot.training?.activeWeeks8).toBe(8);
    expect(snapshot.training?.loggingConsistency8w.value).toBe(1);
    expect(snapshot.coachingSignals.find((signal) => signal.code === "TRAINING_LOGGING_CONSISTENT")?.evidence.activeWeeks).toBe(8);
  });

  it("Client B with training-only consent causes no profile, nutrition, body, or recovery fetch", async () => {
    const deps = dependencies(authorization(["training"]));
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(snapshot.training).toBeDefined();
    expect(snapshot.profile).toBeUndefined();
    expect(snapshot.nutrition).toBeUndefined();
    expect(snapshot.bodyProgress).toBeUndefined();
    expect(snapshot.activity).toBeUndefined();
    expect(deps.repo.loadClient360Profile).not.toHaveBeenCalled();
    expect(deps.repo.loadClient360NutritionDays).not.toHaveBeenCalled();
    expect(deps.nutritionTargets).not.toHaveBeenCalled();
    expect(snapshot.access.sections.nutrition.state).toBe("not_granted");
  });

  it("Client C nutrition revocation removes values and a valid re-consent restores only consented sections", async () => {
    const revoked = dependencies(authorization(["profile", "training"]));
    const revokedSnapshot = await createAscendCoachClient360Service(revoked as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(revokedSnapshot.nutrition).toBeUndefined();
    expect(revoked.repo.loadClient360NutritionDays).not.toHaveBeenCalled();
    const restored = dependencies(authorization(["training", "nutrition"]));
    const restoredSnapshot = await createAscendCoachClient360Service(restored as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(restoredSnapshot.nutrition).toBeDefined();
    expect(restoredSnapshot.profile).toBeUndefined();
    expect(restored.nutritionTargets).toHaveBeenCalledWith(CLIENT_ID, { includeBodyComposition: false, includeWeightHistory: false });
  });

  it.each(["ended_by_trainer", "revoked_by_client", "invited"])("Client D blocks a %s relationship before domain reads", async (status) => {
    const deps = dependencies(authorization([], { relationshipStatus: status }));
    await expect(createAscendCoachClient360Service(deps as never).getSnapshot(actor, CLIENT_ID, NOW)).rejects.toBeInstanceOf(Client360AccessError);
    expect(deps.repo.loadClient360Profile).not.toHaveBeenCalled();
  });

  it("Client E preserves insufficient-data metadata for a sparse new user", async () => {
    const deps = dependencies(authorization(["training", "body"]));
    deps.repo.loadClient360Training.mockResolvedValue({ aggregate: { client_created_at: "2026-08-29T00:00:00.000Z", count_7d: 0, count_30d: 0, count_90d: 0, current_28d: 0, previous_28d: 0, active_weeks_8: 0, last_workout_at: null, duration_count_30d: 0, average_duration_30d: null }, recent: [] });
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(actor, CLIENT_ID, NOW);
    expect(snapshot.training?.frequencyTrend.direction).toBe("insufficient");
    expect(snapshot.training?.loggingConsistency8w.sufficientData).toBe(false);
    expect(snapshot.bodyProgress?.weight.trend28d.sufficientData).toBe(false);
  });

  it("Client F allows all reads through one valid break-glass batch and marks every section", async () => {
    const decisions = Object.fromEntries(actions.map((action) => [action, { allowed: true, breakGlassGrantId: "grant" }]));
    const deps = dependencies(authorization([], { decisions, relationshipId: null, relationshipStatus: null, authorizationVersion: null, breakGlassGrantId: "grant" }));
    const owner = { ...actor, primaryRole: "owner" as const, roles: ["owner" as const, "admin" as const], trainerId: undefined, isPlatformOwner: true };
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(owner, CLIENT_ID, NOW);
    expect(snapshot.access.mode).toBe("break_glass");
    expect(Object.values(snapshot.access.sections).every((section) => section.state === "break_glass")).toBe(true);
    expect(deps.authorize).toHaveBeenCalledTimes(1);
  });

  it("gives the Platform Owner all deterministic sections without a relationship", async () => {
    const decisions = Object.fromEntries(actions.map((action) => [action, { allowed: true, platformOwnerAccess: true }]));
    const deps = dependencies(authorization([], {
      decisions,
      relationshipId: null,
      relationshipStatus: null,
      authorizationVersion: null,
      platformOwnerAccess: true,
      breakGlassGrantId: "older-grant"
    }));
    const owner = { ...actor, primaryRole: "owner" as const, roles: ["owner" as const], trainerId: undefined, isPlatformOwner: true };
    const snapshot = await createAscendCoachClient360Service(deps as never).getSnapshot(owner, CLIENT_ID, NOW);
    expect(snapshot.access).toMatchObject({ mode: "platform_owner", relationshipId: null, authorizationVersion: null });
    expect(Object.values(snapshot.access.sections).every((section) => section.state === "granted")).toBe(true);
    expect(snapshot.profile).toBeDefined();
    expect(snapshot.training).toBeDefined();
    expect(snapshot.nutrition).toBeDefined();
    expect(snapshot.bodyProgress).toBeDefined();
    expect(snapshot.activity).toBeDefined();
  });

  it("Client G and unrelated/normal users without a relationship or live break-glass grant are denied", async () => {
    const denied = authorization([], { relationshipId: null, relationshipStatus: null, authorizationVersion: null });
    for (const requestActor of [actor, { ...actor, primaryRole: "client" as const, roles: ["client" as const], trainerId: undefined }]) {
      const deps = dependencies(denied);
      await expect(createAscendCoachClient360Service(deps as never).getSnapshot(requestActor, CLIENT_ID, NOW)).rejects.toBeInstanceOf(Client360AccessError);
      expect(deps.repo.loadClient360Training).not.toHaveBeenCalled();
    }
  });
});

describe("Client 360 architecture boundaries", () => {
  it("builds the minimum client list without fetching fields outside each relationship scope", async () => {
    const deps = dependencies();
    deps.repo.loadActiveClient360Relationships.mockResolvedValue([
      { client_id: "profile-client", relationship_id: "r1", authorization_version: 2, data_scopes: ["profile"] },
      { client_id: "training-client", relationship_id: "r2", authorization_version: 4, data_scopes: ["training"] }
    ]);
    deps.repo.loadClient360ListProfiles.mockResolvedValue([{ id: "profile-client", full_name: "Profile Client", goal_type: "maintenance" }]);
    deps.repo.loadClient360ListWorkoutDates.mockResolvedValue([{ id: "training-client", last_workout_at: "2026-08-30T00:00:00.000Z" }]);
    const clients = await createAscendCoachClient360Service(deps as never).listClients(actor);
    expect(deps.repo.loadClient360ListProfiles).toHaveBeenCalledWith(["profile-client"]);
    expect(deps.repo.loadClient360ListWorkoutDates).toHaveBeenCalledWith(["training-client"]);
    expect(clients[0]).toMatchObject({ displayName: "Profile Client", goal: "maintenance" });
    expect(clients[0]).not.toHaveProperty("lastWorkoutAt");
    expect(clients[1]).toMatchObject({ lastWorkoutAt: "2026-08-30T00:00:00.000Z" });
    expect(clients[1]).not.toHaveProperty("displayName");
  });

  it("gives the Platform Owner the audited active-client directory", async () => {
    const deps = dependencies();
    deps.repo.loadAllPlatformOwnerClients.mockResolvedValue([
      { id: CLIENT_ID, full_name: "Client A", goal_type: "fat_loss", last_workout_at: "2026-08-30T00:00:00.000Z" }
    ]);
    const owner = { ...actor, primaryRole: "owner" as const, roles: ["owner" as const, "admin" as const], trainerId: undefined, isPlatformOwner: true };
    await expect(createAscendCoachClient360Service(deps as never).listClients(owner)).resolves.toEqual([
      expect.objectContaining({
        clientId: CLIENT_ID,
        accessMode: "platform_owner",
        relationshipId: null,
        authorizationVersion: null,
        displayName: "Client A",
        lastWorkoutAt: "2026-08-30T00:00:00.000Z"
      })
    ]);
    expect(deps.repo.auditPlatformOwnerClientList).toHaveBeenCalledWith(owner.id, 1);
    expect(deps.canUseWorkspace).not.toHaveBeenCalled();
    expect(deps.repo.loadActiveClient360Relationships).not.toHaveBeenCalled();
  });

  it("keeps the minimum client list off when ASCEND_COACH_V1 is disabled", async () => {
    const deps = dependencies();
    deps.featureEnabled.mockReturnValue(false);
    await expect(createAscendCoachClient360Service(deps as never).listClients(actor)).rejects.toBeInstanceOf(Client360AccessError);
    expect(deps.canUseWorkspace).not.toHaveBeenCalled();
    expect(deps.repo.loadActiveClient360Relationships).not.toHaveBeenCalled();
  });

  it("has no AI provider import or AI invocation in snapshot, repository, or deterministic domain modules", () => {
    for (const relative of ["../services/ascendCoachClient360Service.ts", "../services/client360Repository.ts", "../domain/client360.ts"]) {
      const source = readFileSync(join(__dirname, relative), "utf8");
      expect(source).not.toMatch(/integrations\/openai|from ["']openai["']|createCoachResponse|generateText|chat\.completions/i);
    }
  });
});
