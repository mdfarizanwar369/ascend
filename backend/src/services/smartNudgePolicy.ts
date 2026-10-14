import { z } from "zod";
import { nudgeCategories, NudgeCategory, NudgePreferences, validTimezone } from "@ascend/shared";
import { env } from "../config/env";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const category = z.object({ enabled: z.boolean(), time }).strict();
export const nudgePreferencesSchema: z.ZodType<NudgePreferences> = z.object({
  enabled: z.boolean(), timezone: z.string().max(100).refine(validTimezone, "Choose a valid IANA time zone"),
  intensity: z.enum(["minimal", "balanced", "supportive"]), quietStart: time, quietEnd: time,
  weeklyDay: z.number().int().min(0).max(6), comebackDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
  categories: z.object({ breakfast: category, lunch: category, dinner: category, workout: category, hydration: category,
    morning: category, evening: category, weekly: category, comeback: category, milestone: category }).strict()
}).strict();
export function nudgesSchemaEnabled() { return env.ZOE_SMART_NUDGES_SCHEMA || env.ZOE_SMART_NUDGES_ENABLED; }
export function nudgesAvailable(userId: string, category?: NudgeCategory) {
  if (!env.ZOE_SMART_NUDGES_ENABLED || env.ZOE_SMART_NUDGES_ROLLOUT === "off") return false;
  if (category && !env.ZOE_SMART_NUDGES_CATEGORIES.split(",").map(x => x.trim()).includes(category)) return false;
  if (env.ZOE_SMART_NUDGES_ROLLOUT === "development") return env.NODE_ENV !== "production";
  return env.ZOE_SMART_NUDGES_ROLLOUT === "all" || env.ZOE_SMART_NUDGES_USER_IDS.split(",").map(x => x.trim()).includes(userId);
}
export function availableNudgeCategories(userId: string) { return nudgeCategories.filter(c => nudgesAvailable(userId, c)); }
