import {
  CLIENT_360_SCHEMA_VERSION,
  COACH_INSIGHT_PROMPT_VERSION,
  type Client360Snapshot,
  type Client360View,
  type CoachInsightAvailability
} from "@ascend/shared";
import type { AuthUser } from "../middleware/auth";
import {
  buildCoachIntelligenceContext,
  coachInsightPrompts,
  coachIntelligenceFingerprint,
  coachScopeFingerprint,
  parseCoachInsight
} from "../domain/coachIntelligence";
import { createCoachInsightProviderReply, getAiProviderIdentity } from "../integrations/openai";
import { ascendCoachClient360Service, Client360AccessError } from "./ascendCoachClient360Service";
import { authorizeAscendCoachAction } from "./ascendCoachPolicyService";
import { assertCoachInsightAllowance, CoachInsightLimitError, logAiUsage } from "./aiUsageService";
import * as repository from "./coachInsightRepository";

const INSIGHT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const generationFlights = new Map<string, Promise<CoachInsightAvailability>>();

type Dependencies = {
  getSnapshot: typeof ascendCoachClient360Service.getSnapshot;
  authorizeInsight: typeof authorizeAscendCoachAction;
  providerIdentity: typeof getAiProviderIdentity;
  generate: typeof createCoachInsightProviderReply;
  assertAllowance: typeof assertCoachInsightAllowance;
  logUsage: typeof logAiUsage;
  repo: typeof repository;
  now: () => Date;
};

const defaults: Dependencies = {
  getSnapshot: ascendCoachClient360Service.getSnapshot.bind(ascendCoachClient360Service),
  authorizeInsight: authorizeAscendCoachAction,
  providerIdentity: getAiProviderIdentity,
  generate: createCoachInsightProviderReply,
  assertAllowance: assertCoachInsightAllowance,
  logUsage: logAiUsage,
  repo: repository,
  now: () => new Date()
};

function canUseInsight(snapshot: Client360Snapshot) {
  return snapshot.access.mode === "relationship"
    && snapshot.access.relationshipId
    && snapshot.access.authorizationVersion !== null
    && snapshot.access.sections.profile.state === "granted"
    && snapshot.access.sections.training.state === "granted";
}

function unavailableFor(snapshot: Client360Snapshot): CoachInsightAvailability | null {
  if (snapshot.access.mode !== "relationship") return { status: "not_available", reason: "elevated_access" };
  if (!canUseInsight(snapshot)) return { status: "not_available", reason: "access_required" };
  return null;
}

function identityFor(actor: AuthUser, snapshot: Client360Snapshot, provider: string, model: string) {
  if (!snapshot.access.relationshipId || snapshot.access.authorizationVersion === null) throw new Client360AccessError();
  const context = buildCoachIntelligenceContext(snapshot);
  const identity: repository.CoachInsightCacheIdentity = {
    actorUserId: actor.id,
    clientUserId: snapshot.clientId,
    relationshipId: snapshot.access.relationshipId,
    authorizationVersion: snapshot.access.authorizationVersion,
    scopeFingerprint: coachScopeFingerprint(snapshot),
    sourceFingerprint: coachIntelligenceFingerprint(context),
    snapshotSchemaVersion: CLIENT_360_SCHEMA_VERSION,
    promptVersion: COACH_INSIGHT_PROMPT_VERSION,
    provider,
    model
  };
  return { context, identity };
}

function available(row: repository.CoachInsightCacheRow, source: "cache" | "generated"): CoachInsightAvailability {
  return {
    status: "available",
    source,
    insight: row.insight,
    generatedAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    promptVersion: COACH_INSIGHT_PROMPT_VERSION,
    provider: row.provider,
    model: row.model
  };
}

function telemetry(event: string, fields: Record<string, string | number | boolean>) {
  console.info("[ascend-coach-telemetry]", event, fields);
}

export function createAscendCoachInsightService(dependencies: Dependencies = defaults) {
  async function cachedInsight(actor: AuthUser, snapshot: Client360Snapshot): Promise<CoachInsightAvailability> {
    const blocked = unavailableFor(snapshot);
    if (blocked) return blocked;
    const decision = await dependencies.authorizeInsight(actor, snapshot.clientId, "view_ai_insight");
    if (!decision.allowed) return { status: "not_available", reason: "access_required" };
    const provider = dependencies.providerIdentity();
    if (!provider.configured) return { status: "not_available", reason: "provider_unavailable" };
    const { context, identity } = identityFor(actor, snapshot, provider.provider, provider.model);
    const row = await dependencies.repo.findCoachInsight(identity);
    telemetry("coach_insight_cache_hit", { hit: Boolean(row) });
    if (!row) return { status: "not_available", reason: "not_generated" };
    try {
      const insight = parseCoachInsight(JSON.stringify(row.insight), context);
      return available({ ...row, insight }, "cache");
    } catch {
      return { status: "not_available", reason: "not_generated" };
    }
  }

  return {
    async getClient360View(actor: AuthUser, clientId: string): Promise<Client360View> {
      const started = Date.now();
      const snapshot = await dependencies.getSnapshot(actor, clientId);
      const sectionsAuthorized = Object.values(snapshot.access.sections).filter((section) => section.state !== "not_granted").length;
      telemetry("client360_opened", {
        accessMode: snapshot.access.mode,
        sectionsAuthorized
      });
      telemetry("client360_snapshot_latency_ms", {
        latencyMs: Date.now() - started,
        sectionsAuthorized
      });
      return { snapshot, coachInsight: await cachedInsight(actor, snapshot) };
    },

    async refreshCoachInsight(actor: AuthUser, clientId: string): Promise<CoachInsightAvailability> {
      const decision = await dependencies.authorizeInsight(actor, clientId, "view_ai_insight");
      if (!decision.allowed) throw new Client360AccessError();
      telemetry("coach_insight_refresh_requested", { authorized: true });
      const snapshot = await dependencies.getSnapshot(actor, clientId);
      const blocked = unavailableFor(snapshot);
      if (blocked) return blocked;
      const provider = dependencies.providerIdentity();
      if (!provider.configured) return { status: "not_available", reason: "provider_unavailable" };
      const { context, identity } = identityFor(actor, snapshot, provider.provider, provider.model);
      const flightKey = Object.values(identity).join(":");
      const existing = generationFlights.get(flightKey);
      if (existing) return existing;

      const flight = (async (): Promise<CoachInsightAvailability> => {
        const started = Date.now();
        const prompts = coachInsightPrompts(context);
        try {
          await dependencies.assertAllowance(actor.id);
          telemetry("coach_insight_provider_call", { provider: provider.provider, calls: 1 });
          const reply = await dependencies.generate(prompts.system, prompts.user);
          const insight = parseCoachInsight(reply.text, context);
          const now = dependencies.now();
          const row = await dependencies.repo.saveCoachInsight(identity, insight, new Date(now.getTime() + INSIGHT_TTL_MS));
          await dependencies.logUsage({
            userId: actor.id,
            eventType: "coach_insight_generation",
            provider: reply.provider,
            model: reply.model,
            status: "success",
            metadata: { promptVersion: COACH_INSIGHT_PROMPT_VERSION, contextBytes: Buffer.byteLength(prompts.user), sourceKey: identity.sourceFingerprint.slice(0, 12) }
          });
          telemetry("coach_insight_generation_latency", {
            provider: reply.provider,
            model: reply.model,
            latencyMs: Date.now() - started,
            success: true
          });
          return available(row, "generated");
        } catch (error) {
          const quotaReached = error instanceof CoachInsightLimitError;
          telemetry("coach_insight_generation_latency", {
            provider: provider.provider,
            model: provider.model,
            latencyMs: Date.now() - started,
            success: false
          });
          if (!quotaReached) {
            await dependencies.logUsage({
              userId: actor.id,
              eventType: "coach_insight_generation",
              provider: provider.provider,
              model: provider.model,
              status: "error",
              metadata: { promptVersion: COACH_INSIGHT_PROMPT_VERSION, sourceKey: identity.sourceFingerprint.slice(0, 12) }
            }).catch(() => undefined);
          }
          return { status: "not_available", reason: quotaReached ? "quota_reached" : "generation_failed" };
        }
      })().finally(() => generationFlights.delete(flightKey));
      generationFlights.set(flightKey, flight);
      return flight;
    }
  };
}

export const ascendCoachInsightService = createAscendCoachInsightService();
