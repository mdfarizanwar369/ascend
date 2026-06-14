import { createHash } from "crypto";
import { FoodEstimate } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";

export type AiEventType = "food_image_analysis" | "ai_chat_message" | "weekly_report_generation";
export type AiStatus = "success" | "error" | "cache_hit" | "fallback";

const eventCostCents: Record<AiEventType, number> = {
  food_image_analysis: env.AI_FOOD_ANALYSIS_ESTIMATED_COST_CENTS,
  ai_chat_message: env.AI_CHAT_ESTIMATED_COST_CENTS,
  weekly_report_generation: env.AI_WEEKLY_REPORT_ESTIMATED_COST_CENTS
};

export function imageHashFromDataUrl(imageUrl: string) {
  return createHash("sha256").update(imageUrl).digest("hex");
}

export async function ensureAiUsageSchema() {
  await query(`
    create table if not exists food_estimate_cache (
      id uuid primary key default uuid_generate_v4(),
      image_hash text not null unique,
      estimate jsonb not null,
      provider text not null,
      model text,
      source text not null default 'ai',
      hit_count integer not null default 0,
      created_at timestamptz not null default now(),
      last_used_at timestamptz not null default now()
    );

    create table if not exists ai_usage_events (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid references users(id) on delete set null,
      gym_id uuid references gyms(id) on delete set null,
      event_type text not null,
      provider text not null,
      model text,
      status text not null,
      cache_hit boolean not null default false,
      estimated_cost_cents numeric(10,4) not null default 0,
      input_units integer not null default 0,
      output_units integer not null default 0,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    );

    create index if not exists ai_usage_events_created_idx on ai_usage_events(created_at desc);
    create index if not exists ai_usage_events_type_created_idx on ai_usage_events(event_type, created_at desc);
    create index if not exists food_estimate_cache_hash_idx on food_estimate_cache(image_hash);
  `);
}

export async function getCachedFoodEstimate(imageHash: string) {
  const result = await query<{ estimate: FoodEstimate }>(
    `
    update food_estimate_cache
    set hit_count = hit_count + 1, last_used_at = now()
    where image_hash = $1
    returning estimate
    `,
    [imageHash]
  );

  return result.rows[0]?.estimate ?? null;
}

export async function saveFoodEstimateCache(input: {
  imageHash: string;
  estimate: FoodEstimate;
  provider: string;
  model?: string | null;
  source?: string;
}) {
  await query(
    `
    insert into food_estimate_cache (image_hash, estimate, provider, model, source)
    values ($1, $2, $3, $4, $5)
    on conflict (image_hash) do update set
      estimate = excluded.estimate,
      provider = excluded.provider,
      model = excluded.model,
      source = excluded.source,
      last_used_at = now()
    `,
    [input.imageHash, input.estimate, input.provider, input.model ?? null, input.source ?? "ai"]
  );
}

export async function logAiUsage(input: {
  userId?: string | null;
  gymId?: string | null;
  eventType: AiEventType;
  provider: string;
  model?: string | null;
  status: AiStatus;
  cacheHit?: boolean;
  inputUnits?: number;
  outputUnits?: number;
  metadata?: Record<string, unknown>;
}) {
  const estimatedCostCents = input.cacheHit ? 0 : eventCostCents[input.eventType];
  await query(
    `
    insert into ai_usage_events (
      user_id, gym_id, event_type, provider, model, status, cache_hit,
      estimated_cost_cents, input_units, output_units, metadata
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      input.userId ?? null,
      input.gymId ?? null,
      input.eventType,
      input.provider,
      input.model ?? null,
      input.status,
      input.cacheHit ?? false,
      estimatedCostCents,
      input.inputUnits ?? 0,
      input.outputUnits ?? 0,
      input.metadata ?? {}
    ]
  );
}

export function aiLimitConfig() {
  return {
    monthlySpendLimitCents: env.AI_MONTHLY_SPEND_LIMIT_CENTS,
    monthlyFoodAnalysisLimit: env.AI_MONTHLY_FOOD_ANALYSIS_LIMIT,
    monthlyChatLimit: env.AI_MONTHLY_CHAT_LIMIT,
    monthlyWeeklyReportLimit: env.AI_MONTHLY_WEEKLY_REPORT_LIMIT
  };
}
