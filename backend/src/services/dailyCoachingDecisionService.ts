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

type StoredDecision = {
  id: string;
  priority: DailyCoachingPriority;
  insight: DailyCoachingInsight;
  decision_source: "rules" | "ai";
  ai_attempted: boolean;
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
    legacyPriorityKey: DailyCoachingPriority["key"];
    expiresAt: string;
  }): Promise<string | null>;
}

const postgresDecisionStore: DailyCoachingDecisionStore = {
  async findCached(input) {
    const result = await query<StoredDecision>(
      `
      select id, priority, insight, decision_source, ai_attempted
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

  async save(input) {
    const result = await query<{ id: string }>(
      `
      insert into daily_coaching_decisions (
        user_id, local_date, timezone_offset_minutes, input_fingerprint,
        engine_version, resolution_mode, decision_source, priority_key,
        priority, insight, ai_attempted, legacy_priority_key, expires_at
      )
      values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)
      on conflict (user_id, local_date, input_fingerprint, engine_version, resolution_mode)
      do update set
        decision_source = excluded.decision_source,
        priority_key = excluded.priority_key,
        priority = excluded.priority,
        insight = excluded.insight,
        ai_attempted = excluded.ai_attempted,
        legacy_priority_key = excluded.legacy_priority_key,
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

export async function resolveDailyCoachingDecision(input: {
  userId: string;
  localDate: string;
  timezoneOffsetMinutes: number;
  expiresAt: string;
  facts: TodayPriorityFacts;
  allowAiRefinement: boolean;
  legacyPriorityKey: DailyCoachingPriority["key"];
}, dependencies: {
  store?: DailyCoachingDecisionStore;
  refine?: (input: { candidates: TodayPriorityCandidate[]; facts: TodayPriorityFacts }) => Promise<TodayPriorityCandidate | null>;
  maxAiRefinementsPerDay?: number;
} = {}): Promise<DailyCoachingDecision> {
  const store = dependencies.store ?? postgresDecisionStore;
  const resolutionMode = input.allowAiRefinement ? "refined" : "rules_only";
  const fingerprint = dailyCoachingFingerprint(input.localDate, input.facts);
  const cached = await store.findCached({
    userId: input.userId,
    localDate: input.localDate,
    fingerprint,
    engineVersion: DAILY_COACHING_ENGINE_VERSION,
    resolutionMode
  });
  if (cached) {
    return {
      id: cached.id,
      priority: cached.priority,
      insight: cached.insight,
      decisionSource: cached.decision_source,
      responseSource: "cache",
      cacheHit: true,
      aiAttempted: cached.ai_attempted,
      engineVersion: DAILY_COACHING_ENGINE_VERSION
    };
  }

  const candidates = buildTodayPriorityCandidates(input.facts);
  const deterministic = deterministicTodayPriority(input.facts);
  const isFirstCheckIn = input.facts.mealsToday === 0
    && input.facts.waterTodayMl === 0
    && input.facts.daysSinceWorkout === null
    && input.facts.stepsToday === 0
    && input.facts.activeCaloriesToday === 0
    && input.facts.sleepQuality === null;
  let priority: DailyCoachingPriority = deterministic;
  let decisionSource: "rules" | "ai" = "rules";
  let aiAttempted = false;

  if (input.allowAiRefinement && !isFirstCheckIn && shouldUseAiPriorityRefinement(candidates) && dependencies.refine) {
    const attempts = await store.countAiAttempts({
      userId: input.userId,
      localDate: input.localDate,
      engineVersion: DAILY_COACHING_ENGINE_VERSION
    });
    if (attempts < (dependencies.maxAiRefinementsPerDay ?? MAX_AI_REFINEMENTS_PER_DAY)) {
      aiAttempted = true;
      const leadingRank = candidates[0]?.rank ?? 0;
      const contenders = candidates.filter((candidate) => leadingRank - candidate.rank <= 10);
      const refined = await dependencies.refine({ candidates: contenders, facts: input.facts }).catch(() => null);
      if (refined) {
        priority = refined;
        decisionSource = "ai";
      }
    }
  }

  const insight = buildDailyCoachingInsight(priority, input.facts);
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
    engineVersion: DAILY_COACHING_ENGINE_VERSION
  };
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
    order by created_at desc
    limit 1
    `,
    [userId]
  );
  const row = result.rows[0];
  return row ? { id: row.id, insight: row.insight } : null;
}
