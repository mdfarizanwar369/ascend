import { createHash } from "crypto";
import { query } from "../db/pool";
import {
  buildTodayPriorityCandidates,
  deterministicTodayPriority,
  shouldUseAiPriorityRefinement,
  TodayPriorityCandidate,
  TodayPriorityFacts
} from "./todayPriorityService";

export const DAILY_COACHING_ENGINE_VERSION = "daily-coaching-v1";
const MAX_AI_REFINEMENTS_PER_DAY = 3;
const DECISION_RETENTION_DAYS = 90;

export type DailyCoachingRefinementStatus =
  | "disabled"
  | "not_needed"
  | "not_available"
  | "capped"
  | "selected"
  | "no_result"
  | "not_recorded";

export type DailyCoachingPriority = Omit<TodayPriorityCandidate, "rank"> & { rank: number } | {
  key: null;
  title: string;
  reason: string;
  href: string;
  cta: string;
  rank: number;
};

export type DailyCoachingInsight = {
  title: "Today's Insight";
  body: string;
  href: string;
};

export type DailyCoachingDecision = {
  id: string | null;
  priority: DailyCoachingPriority;
  insight: DailyCoachingInsight;
  decisionSource: "rules" | "ai";
  responseSource: "rules" | "cache" | "ai";
  cacheHit: boolean;
  aiAttempted: boolean;
  refinementStatus: DailyCoachingRefinementStatus;
  resolutionDurationMs: number;
  engineVersion: string;
};

export function dailyCoachingRolloutMode(input: {
  enabledForAll: boolean;
  shadowEnabled: boolean;
  ownerPilotEnabled: boolean;
  isPlatformOwner: boolean;
}): "active" | "shadow" | "legacy" {
  if (input.enabledForAll || (input.ownerPilotEnabled && input.isPlatformOwner)) return "active";
  if (input.shadowEnabled) return "shadow";
  return "legacy";
}

export function dailyCoachingNotificationSource(
  rolloutMode: "active" | "shadow" | "legacy",
  hasCachedDecision: boolean
): "unified" | "legacy" | "none" {
  if (rolloutMode !== "active") return "legacy";
  return hasCachedDecision ? "unified" : "none";
}

type StoredDecision = {
  id: string;
  priority: DailyCoachingPriority;
  insight: DailyCoachingInsight;
  decision_source: "rules" | "ai";
  ai_attempted: boolean;
  refinement_status: DailyCoachingRefinementStatus;
};

export interface DailyCoachingDecisionStore {
  findCached(input: {
    userId: string;
    localDate: string;
    fingerprint: string;
    engineVersion: string;
    resolutionMode: "rules_only" | "refined";
  }): Promise<StoredDecision | null>;
  countAiAttempts(input: { userId: string; localDate: string; engineVersion: string }): Promise<number>;
  refreshPresentation(input: {
    id: string;
    priority: DailyCoachingPriority;
    insight: DailyCoachingInsight;
  }): Promise<void>;
  save(input: {
    userId: string;
    localDate: string;
    timezoneOffsetMinutes: number;
    fingerprint: string;
    engineVersion: string;
    resolutionMode: "rules_only" | "refined";
    decisionSource: "rules" | "ai";
    priority: DailyCoachingPriority;
    insight: DailyCoachingInsight;
    aiAttempted: boolean;
    refinementStatus: DailyCoachingRefinementStatus;
    aiProvider: string | null;
    aiModel: string | null;
    promptVersion: string | null;
    resolutionDurationMs: number;
    legacyPriorityKey: DailyCoachingPriority["key"];
    expiresAt: string;
  }): Promise<string | null>;
}

const postgresDecisionStore: DailyCoachingDecisionStore = {
  async findCached(input) {
    const result = await query<StoredDecision>(
      `
      select id, priority, insight, decision_source, ai_attempted, refinement_status
      from daily_coaching_decisions
      where user_id = $1
        and local_date = $2::date
        and input_fingerprint = $3
        and engine_version = $4
        and resolution_mode = $5
        and expires_at > now()
      limit 1
      `,
      [input.userId, input.localDate, input.fingerprint, input.engineVersion, input.resolutionMode]
    );
    return result.rows[0] ?? null;
  },

  async countAiAttempts(input) {
    const result = await query<{ attempts: number | string }>(
      `
      select count(*)::int as attempts
      from daily_coaching_decisions
      where user_id = $1
        and local_date = $2::date
        and engine_version = $3
        and resolution_mode = 'refined'
        and ai_attempted = true
      `,
      [input.userId, input.localDate, input.engineVersion]
    );
    return Number(result.rows[0]?.attempts ?? 0);
  },

  async refreshPresentation(input) {
    await query(
      `
      update daily_coaching_decisions
      set priority = $2::jsonb, insight = $3::jsonb, updated_at = now()
      where id = $1
      `,
      [input.id, JSON.stringify(input.priority), JSON.stringify(input.insight)]
    );
  },

  async save(input) {
    const result = await query<{ id: string }>(
      `
      insert into daily_coaching_decisions (
        user_id, local_date, timezone_offset_minutes, input_fingerprint,
        engine_version, resolution_mode, decision_source, priority_key,
        priority, insight, ai_attempted, refinement_status, ai_provider, ai_model,
        prompt_version, resolution_duration_ms, legacy_priority_key, legacy_matches, expires_at
      )
      values (
        $1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12,
        $13, $14, $15, $16, $17, case when $17 is null then null else $8 is not distinct from $17 end, $18
      )
      on conflict (user_id, local_date, input_fingerprint, engine_version, resolution_mode)
      do update set
        decision_source = excluded.decision_source,
        priority_key = excluded.priority_key,
        priority = excluded.priority,
        insight = excluded.insight,
        ai_attempted = excluded.ai_attempted,
        refinement_status = excluded.refinement_status,
        ai_provider = excluded.ai_provider,
        ai_model = excluded.ai_model,
        prompt_version = excluded.prompt_version,
        resolution_duration_ms = excluded.resolution_duration_ms,
        legacy_priority_key = excluded.legacy_priority_key,
        legacy_matches = excluded.legacy_matches,
        expires_at = excluded.expires_at,
        updated_at = now()
      returning id
      `,
      [
        input.userId,
        input.localDate,
        input.timezoneOffsetMinutes,
        input.fingerprint,
        input.engineVersion,
        input.resolutionMode,
        input.decisionSource,
        input.priority.key,
        JSON.stringify(input.priority),
        JSON.stringify(input.insight),
        input.aiAttempted,
        input.refinementStatus,
        input.aiProvider,
        input.aiModel,
        input.promptVersion,
        input.resolutionDurationMs,
        input.legacyPriorityKey,
        input.expiresAt
      ]
    );
    return result.rows[0]?.id ?? null;
  }
};

function timeBand(localHour: number) {
  if (localHour < 11) return "early";
  if (localHour < 12) return "late_morning";
  if (localHour < 16) return "midday";
  if (localHour < 17) return "late_afternoon";
  if (localHour < 19) return "evening";
  return "late_evening";
}

function ratioBucket(value: number, target: number) {
  if (target <= 0) return "unknown";
  const ratio = value / target;
  if (ratio <= 0) return "zero";
  if (ratio < 0.25) return "under_25";
  if (ratio < 0.5) return "under_50";
  if (ratio < 0.6) return "under_60";
  if (ratio < 0.75) return "under_75";
  if (ratio < 1) return "under_100";
  return "complete";
}

export function dailyCoachingFingerprint(localDate: string, facts: TodayPriorityFacts) {
  const normalized = {
    localDate,
    timeBand: timeBand(facts.localHour),
    mealsToday: Math.min(facts.mealsToday, 4),
    proteinProgress: ratioBucket(facts.proteinTodayG, facts.proteinTargetG),
    waterProgress: ratioBucket(facts.waterTodayMl, facts.waterTargetMl),
    workoutCompletedToday: facts.workoutCompletedToday,
    daysSinceWorkout: facts.daysSinceWorkout === null ? null : Math.min(facts.daysSinceWorkout, 14),
    steps: facts.stepsToday >= 5_000 ? "underway" : facts.stepsToday >= 2_500 ? "partial" : "low",
    activeCalories: facts.activeCaloriesToday >= 150 ? "underway" : "low",
    sleepQuality: facts.sleepQuality
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function buildDailyCoachingInsight(priority: DailyCoachingPriority, facts: TodayPriorityFacts): DailyCoachingInsight {
  if (priority.key === "Meal") {
    const body = facts.workoutCompletedToday
      ? "Your movement is complete. A protein-rich meal is the clearest way to support recovery now."
      : facts.mealsToday === 0
        ? "Start with one honest meal. That gives Ascend something real to guide the rest of your day."
        : "Food is the clearest opportunity left today. Make the next meal protein-rich and keep it simple.";
    return { title: "Today's Insight", body, href: priority.href };
  }

  if (priority.key === "Movement") {
    const gentle = facts.daysSinceWorkout === 1 || facts.sleepQuality === "poor";
    const body = gentle
      ? "Today does not need intensity. Gentle movement is enough to keep your rhythm without forcing recovery."
      : facts.stepsToday >= 2_500
        ? `You already have ${facts.stepsToday.toLocaleString()} steps. A short walk is enough to build on that.`
        : facts.daysSinceWorkout !== null && facts.daysSinceWorkout >= 3
          ? `It has been ${facts.daysSinceWorkout} days since your last recorded workout. A short session is the most useful next step.`
          : "Movement is the clearest opportunity today. One manageable session is enough.";
    return { title: "Today's Insight", body, href: priority.href };
  }

  if (priority.key === "Water") {
    const waterLeftMl = Math.max(0, facts.waterTargetMl - facts.waterTodayMl);
    return {
      title: "Today's Insight",
      body: `${Number((waterLeftMl / 1000).toFixed(1))}L remains toward today's water guide. Keep sipping gradually rather than forcing it at once.`,
      href: priority.href
    };
  }

  return {
    title: "Today's Insight",
    body: "Your important basics are already in motion. Protect the progress you have built and keep the rest of today steady.",
    href: priority.href
  };
}

type ResolveDailyCoachingDecisionInput = {
  userId: string;
  localDate: string;
  timezoneOffsetMinutes: number;
  expiresAt: string;
  facts: TodayPriorityFacts;
  allowAiRefinement: boolean;
  legacyPriorityKey: DailyCoachingPriority["key"];
};

type ResolveDailyCoachingDecisionDependencies = {
  store?: DailyCoachingDecisionStore;
  refine?: (input: { candidates: TodayPriorityCandidate[]; facts: TodayPriorityFacts }) => Promise<TodayPriorityCandidate | null>;
  maxAiRefinementsPerDay?: number;
  aiProvider?: string | null;
  aiModel?: string | null;
  promptVersion?: string | null;
};

const inFlightDecisions = new Map<string, Promise<DailyCoachingDecision>>();

function refreshedPriority(
  cached: DailyCoachingPriority,
  candidates: TodayPriorityCandidate[],
  deterministic: DailyCoachingPriority
) {
  if (cached.key === null) return deterministic;
  return candidates.find((candidate) => candidate.key === cached.key) ?? deterministic;
}

async function resolveDailyCoachingDecisionUncoalesced(
  input: ResolveDailyCoachingDecisionInput,
  dependencies: ResolveDailyCoachingDecisionDependencies,
  store: DailyCoachingDecisionStore,
  fingerprint: string,
  resolutionMode: "rules_only" | "refined"
): Promise<DailyCoachingDecision> {
  const startedAt = Date.now();
  const candidates = buildTodayPriorityCandidates(input.facts);
  const deterministic = deterministicTodayPriority(input.facts);
  const cached = await store.findCached({
    userId: input.userId,
    localDate: input.localDate,
    fingerprint,
    engineVersion: DAILY_COACHING_ENGINE_VERSION,
    resolutionMode
  });
  if (cached) {
    const priority = refreshedPriority(cached.priority, candidates, deterministic);
    const insight = buildDailyCoachingInsight(priority, input.facts);
    if (JSON.stringify(priority) !== JSON.stringify(cached.priority) || JSON.stringify(insight) !== JSON.stringify(cached.insight)) {
      await store.refreshPresentation({ id: cached.id, priority, insight });
    }
    return {
      id: cached.id,
      priority,
      insight,
      decisionSource: cached.decision_source,
      responseSource: "cache",
      cacheHit: true,
      aiAttempted: cached.ai_attempted,
      refinementStatus: cached.refinement_status,
      resolutionDurationMs: Date.now() - startedAt,
      engineVersion: DAILY_COACHING_ENGINE_VERSION
    };
  }

  const isFirstCheckIn = input.facts.mealsToday === 0
    && input.facts.waterTodayMl === 0
    && input.facts.daysSinceWorkout === null
    && input.facts.stepsToday === 0
    && input.facts.activeCaloriesToday === 0
    && input.facts.sleepQuality === null;
  let priority: DailyCoachingPriority = deterministic;
  let decisionSource: "rules" | "ai" = "rules";
  let aiAttempted = false;
  let refinementStatus: DailyCoachingRefinementStatus = input.allowAiRefinement ? "not_needed" : "disabled";

  if (input.allowAiRefinement && !isFirstCheckIn && shouldUseAiPriorityRefinement(candidates)) {
    if (!dependencies.refine) {
      refinementStatus = "not_available";
    } else {
      const attempts = await store.countAiAttempts({
        userId: input.userId,
        localDate: input.localDate,
        engineVersion: DAILY_COACHING_ENGINE_VERSION
      });
      if (attempts >= (dependencies.maxAiRefinementsPerDay ?? MAX_AI_REFINEMENTS_PER_DAY)) {
        refinementStatus = "capped";
      } else {
        aiAttempted = true;
        const leadingRank = candidates[0]?.rank ?? 0;
        const contenders = candidates.filter((candidate) => leadingRank - candidate.rank <= 10);
        const refined = await dependencies.refine({ candidates: contenders, facts: input.facts }).catch(() => null);
        if (refined) {
          priority = refreshedPriority(refined, candidates, deterministic);
          decisionSource = "ai";
          refinementStatus = "selected";
        } else {
          refinementStatus = "no_result";
        }
      }
    }
  }

  const insight = buildDailyCoachingInsight(priority, input.facts);
  const resolutionDurationMs = Date.now() - startedAt;
  const id = await store.save({
    userId: input.userId,
    localDate: input.localDate,
    timezoneOffsetMinutes: input.timezoneOffsetMinutes,
    fingerprint,
    engineVersion: DAILY_COACHING_ENGINE_VERSION,
    resolutionMode,
    decisionSource,
    priority,
    insight,
    aiAttempted,
    refinementStatus,
    aiProvider: aiAttempted ? dependencies.aiProvider ?? null : null,
    aiModel: aiAttempted ? dependencies.aiModel ?? null : null,
    promptVersion: aiAttempted ? dependencies.promptVersion ?? null : null,
    resolutionDurationMs,
    legacyPriorityKey: input.legacyPriorityKey,
    expiresAt: input.expiresAt
  });

  return {
    id,
    priority,
    insight,
    decisionSource,
    responseSource: decisionSource,
    cacheHit: false,
    aiAttempted,
    refinementStatus,
    resolutionDurationMs,
    engineVersion: DAILY_COACHING_ENGINE_VERSION
  };
}

export async function resolveDailyCoachingDecision(
  input: ResolveDailyCoachingDecisionInput,
  dependencies: ResolveDailyCoachingDecisionDependencies = {}
): Promise<DailyCoachingDecision> {
  const store = dependencies.store ?? postgresDecisionStore;
  const resolutionMode = input.allowAiRefinement ? "refined" : "rules_only";
  const fingerprint = dailyCoachingFingerprint(input.localDate, input.facts);
  const inFlightKey = [input.userId, input.localDate, fingerprint, DAILY_COACHING_ENGINE_VERSION, resolutionMode].join(":");
  const existing = inFlightDecisions.get(inFlightKey);
  if (existing) return existing;

  const pending = resolveDailyCoachingDecisionUncoalesced(
    input,
    dependencies,
    store,
    fingerprint,
    resolutionMode
  ).finally(() => {
    if (inFlightDecisions.get(inFlightKey) === pending) inFlightDecisions.delete(inFlightKey);
  });
  inFlightDecisions.set(inFlightKey, pending);
  return pending;
}

export async function getLatestCachedDailyCoachingInsight(userId: string) {
  const result = await query<{
    id: string;
    insight: DailyCoachingInsight;
  }>(
    `
    select id, insight
    from daily_coaching_decisions
    where user_id = $1
      and resolution_mode = 'refined'
      and expires_at > now()
    order by updated_at desc
    limit 1
    `,
    [userId]
  );
  const row = result.rows[0];
  return row ? { id: row.id, insight: row.insight } : null;
}

export async function cleanupExpiredDailyCoachingDecisions(retentionDays = DECISION_RETENTION_DAYS) {
  const safeRetentionDays = Math.max(1, Math.min(365, Math.trunc(retentionDays)));
  const result = await query(
    `
    delete from daily_coaching_decisions
    where expires_at < now() - ($1::int * interval '1 day')
    `,
    [safeRetentionDays]
  );
  return result.rowCount ?? 0;
}
