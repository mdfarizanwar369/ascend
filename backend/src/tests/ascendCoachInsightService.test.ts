import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { Client360AccessError } from "../services/ascendCoachClient360Service";
import { createAscendCoachInsightService } from "../services/ascendCoachInsightService";
import { CoachInsightLimitError } from "../services/aiUsageService";
import * as repository from "../services/coachInsightRepository";
import { coachSnapshot, validInsight } from "./coachIntelligence.test";

const actor: AuthUser = { id: "trainer-a", firebaseUid: "fb", email: "trainer@example.com", roles: ["trainer"], primaryRole: "trainer", trainerId: "trainer-id", isPlatformOwner: false };
const cacheRow = {
  insight: JSON.parse(validInsight), created_at: "2026-09-01T00:00:00.000Z", expires_at: "2026-09-08T00:00:00.000Z", provider: "openai", model: "gpt-test", prompt_version: "coach-insight-v2"
};

afterEach(() => vi.restoreAllMocks());

function dependencies(snapshot = coachSnapshot()) {
  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    authorizeInsight: vi.fn().mockResolvedValue({ allowed: true, relationshipId: snapshot.access.relationshipId, authorizationVersion: snapshot.access.authorizationVersion, dataScopes: ["profile", "training"] }),
    providerIdentity: vi.fn().mockReturnValue({ provider: "openai", model: "gpt-test", configured: true }),
    generate: vi.fn().mockResolvedValue({ text: validInsight, provider: "openai", model: "gpt-test" }),
    assertAllowance: vi.fn().mockResolvedValue(undefined),
    logUsage: vi.fn().mockResolvedValue(undefined),
    repo: { ...repository, findCoachInsight: vi.fn().mockResolvedValue(null), saveCoachInsight: vi.fn().mockResolvedValue(cacheRow) },
    now: () => new Date("2026-09-01T00:00:00.000Z")
  };
}

describe("Ascend Coach Insight cache and authorization", () => {
  it("returns a cache hit with zero provider calls", async () => {
    const deps = dependencies();
    deps.repo.findCoachInsight.mockResolvedValue(cacheRow);
    const view = await createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId);
    expect(view.coachInsight).toMatchObject({ status: "available", source: "cache" });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.assertAllowance).not.toHaveBeenCalled();
  });

  it("normal page load never generates when cache is empty", async () => {
    const deps = dependencies();
    const view = await createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId);
    expect(view.coachInsight).toEqual({ status: "not_available", reason: "not_generated" });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("does not return a malformed persisted payload", async () => {
    const deps = dependencies();
    deps.repo.findCoachInsight.mockResolvedValue({ ...cacheRow, insight: { summary: "invalid" } });
    const view = await createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId);
    expect(view.coachInsight).toEqual({ status: "not_available", reason: "not_generated" });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("explicit refresh performs exactly one call and persists validated output", async () => {
    const deps = dependencies();
    const result = await createAscendCoachInsightService(deps as never).refreshCoachInsight(actor, coachSnapshot().clientId);
    expect(result).toMatchObject({ status: "available", source: "generated" });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.repo.saveCoachInsight).toHaveBeenCalledTimes(1);
    expect(deps.logUsage).toHaveBeenCalledWith(expect.objectContaining({ eventType: "coach_insight_generation", status: "success" }));
  });

  it("binds cache lookup to trainer, client, relationship, authorization version, scope, source, prompt, provider, and model", async () => {
    const deps = dependencies();
    await createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId);
    expect(deps.repo.findCoachInsight).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "trainer-a", clientUserId: coachSnapshot().clientId,
      relationshipId: coachSnapshot().access.relationshipId,
      authorizationVersion: 3, promptVersion: "coach-insight-v2", provider: "openai", model: "gpt-test"
    }));
    const identity = deps.repo.findCoachInsight.mock.calls[0][0];
    expect(identity.scopeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not read or create persistent insight during break-glass", async () => {
    const snapshot = coachSnapshot({ access: { ...coachSnapshot().access, mode: "break_glass", relationshipId: null, authorizationVersion: null, relationshipStatus: null, sections: Object.fromEntries(Object.entries(coachSnapshot().access.sections).map(([key, value]) => [key, { ...value, state: "break_glass" }])) as never } });
    const deps = dependencies(snapshot);
    const view = await createAscendCoachInsightService(deps as never).getClient360View({ ...actor, isPlatformOwner: true }, snapshot.clientId);
    expect(view.coachInsight).toEqual({ status: "not_available", reason: "elevated_access" });
    expect(deps.repo.findCoachInsight).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("does not read or create persistent insight during Platform Owner access", async () => {
    const snapshot = coachSnapshot({ access: { ...coachSnapshot().access, mode: "platform_owner", relationshipId: null, authorizationVersion: null, relationshipStatus: null } });
    const deps = dependencies(snapshot);
    const view = await createAscendCoachInsightService(deps as never).getClient360View({ ...actor, isPlatformOwner: true }, snapshot.clientId);
    expect(view.coachInsight).toEqual({ status: "not_available", reason: "elevated_access" });
    expect(deps.authorizeInsight).not.toHaveBeenCalled();
    expect(deps.repo.findCoachInsight).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("denies ended/revoked/unrelated access before any cache operation", async () => {
    const deps = dependencies();
    deps.getSnapshot.mockRejectedValue(new Client360AccessError());
    await expect(createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId)).rejects.toBeInstanceOf(Client360AccessError);
    expect(deps.repo.findCoachInsight).not.toHaveBeenCalled();
  });

  it("scope reduction and authorization version changes create different cache identities", async () => {
    const first = dependencies();
    await createAscendCoachInsightService(first as never).getClient360View(actor, coachSnapshot().clientId);
    const reducedSnapshot = coachSnapshot({ access: { ...coachSnapshot().access, authorizationVersion: 4, sections: { ...coachSnapshot().access.sections, profile: { state: "not_granted", requiredScope: "profile" } } }, profile: undefined });
    const reduced = dependencies(reducedSnapshot);
    const view = await createAscendCoachInsightService(reduced as never).getClient360View(actor, reducedSnapshot.clientId);
    expect(view.coachInsight).toEqual({ status: "not_available", reason: "access_required" });
    expect(reduced.repo.findCoachInsight).not.toHaveBeenCalled();
  });

  it("malformed output fails safely, is not saved, and has no retry loop", async () => {
    const deps = dependencies();
    deps.generate.mockResolvedValue({ text: "not-json", provider: "openai", model: "gpt-test" });
    const result = await createAscendCoachInsightService(deps as never).refreshCoachInsight(actor, coachSnapshot().clientId);
    expect(result).toEqual({ status: "not_available", reason: "generation_failed" });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.repo.saveCoachInsight).not.toHaveBeenCalled();
  });

  it("provider timeout fails safely without retry", async () => {
    const deps = dependencies();
    deps.generate.mockRejectedValue(new Error("timed out"));
    const result = await createAscendCoachInsightService(deps as never).refreshCoachInsight(actor, coachSnapshot().clientId);
    expect(result).toEqual({ status: "not_available", reason: "generation_failed" });
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it("enforces the existing Coach Insight quota before calling Gemini", async () => {
    const deps = dependencies();
    deps.assertAllowance.mockRejectedValue(new CoachInsightLimitError());
    const result = await createAscendCoachInsightService(deps as never).refreshCoachInsight(actor, coachSnapshot().clientId);
    expect(result).toEqual({ status: "not_available", reason: "quota_reached" });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.logUsage).not.toHaveBeenCalled();
  });

  it("emits pilot telemetry without client or trainer identifiers", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies();
    await createAscendCoachInsightService(deps as never).getClient360View(actor, coachSnapshot().clientId);
    await createAscendCoachInsightService(deps as never).refreshCoachInsight(actor, coachSnapshot().clientId);
    const events = telemetry.mock.calls.map((call) => call[1]);
    expect(events).toEqual(expect.arrayContaining([
      "client360_opened",
      "client360_snapshot_latency_ms",
      "coach_insight_cache_hit",
      "coach_insight_refresh_requested",
      "coach_insight_provider_call",
      "coach_insight_generation_latency"
    ]));
    const serialized = JSON.stringify(telemetry.mock.calls);
    expect(serialized).not.toContain(actor.id);
    expect(serialized).not.toContain(coachSnapshot().clientId);
  });
});
