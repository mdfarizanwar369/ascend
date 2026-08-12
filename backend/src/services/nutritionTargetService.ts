import { calculateAdaptiveNutritionTargets, NutritionTargets } from "@ascend/shared";
import { z } from "zod";
import { query } from "../db/pool";
import { bodyCompositionForNutrition, bodyCompositionScanFromDb } from "./bodyCompositionService";

export type NutritionTargetSource = "coach_plan" | "member_custom" | "body_scan" | "ascend_recommendation";

export type ResolvedNutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  source: NutritionTargetSource;
  sourceLabel: string;
  explanation: string;
  updatedAt: string | null;
  editableByMember: boolean;
  memberPreferenceMode: "ascend" | "custom";
  savedMemberTargets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
};

type StoredTargets = {
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  updated_at: string;
};

type MemberPreference = Partial<StoredTargets> & {
  mode: "ascend" | "custom";
};

export const memberNutritionPreferenceSchema = z.object({
  mode: z.enum(["ascend", "custom"]),
  calories: z.coerce.number().int().min(1200).max(5000).optional(),
  proteinG: z.coerce.number().int().min(30).max(400).optional(),
  carbsG: z.coerce.number().int().min(0).max(700).optional(),
  fatG: z.coerce.number().int().min(20).max(250).optional()
}).superRefine((input, ctx) => {
  if (input.mode !== "custom") return;
  for (const field of ["calories", "proteinG", "carbsG", "fatG"] as const) {
    if (input[field] === undefined) {
      ctx.addIssue({ code: "custom", path: [field], message: "All custom nutrition targets are required." });
    }
  }
  if ([input.calories, input.proteinG, input.carbsG, input.fatG].some((value) => value === undefined)) return;
  const macroCalories = input.proteinG! * 4 + input.carbsG! * 4 + input.fatG! * 9;
  const allowedDifference = Math.max(250, input.calories! * 0.2);
  if (Math.abs(macroCalories - input.calories!) > allowedDifference) {
    ctx.addIssue({
      code: "custom",
      path: ["calories"],
      message: "Calories and macros do not closely match. Adjust calories or the macro targets before saving."
    });
  }
});

function numericTargets(input: StoredTargets) {
  return {
    calories: Number(input.calories),
    proteinG: Number(input.protein_g),
    carbsG: Number(input.carbs_g),
    fatG: Number(input.fat_g)
  };
}

export function applyNutritionTargetPrecedence(input: {
  recommended: NutritionTargets;
  coachPlan?: StoredTargets | null;
  memberPreference?: MemberPreference | null;
  bodyScanUsed: boolean;
}): ResolvedNutritionTargets {
  const savedMemberTargets = input.memberPreference?.calories !== undefined && input.memberPreference?.protein_g !== undefined &&
    input.memberPreference?.carbs_g !== undefined && input.memberPreference?.fat_g !== undefined
    ? numericTargets(input.memberPreference as StoredTargets)
    : null;
  const memberPreferenceMode = input.memberPreference?.mode ?? "ascend";

  if (input.coachPlan) {
    return {
      ...numericTargets(input.coachPlan),
      waterMl: input.recommended.waterTargetMl,
      source: "coach_plan",
      sourceLabel: "Coach Plan",
      explanation: "Your assigned coach set these targets for your current plan.",
      updatedAt: input.coachPlan.updated_at,
      editableByMember: false,
      memberPreferenceMode,
      savedMemberTargets
    };
  }

  if (memberPreferenceMode === "custom" && savedMemberTargets) {
    return {
      ...savedMemberTargets,
      waterMl: input.recommended.waterTargetMl,
      source: "member_custom",
      sourceLabel: "Your Targets",
      explanation: "You chose these daily calorie and macro targets.",
      updatedAt: input.memberPreference?.updated_at ?? null,
      editableByMember: true,
      memberPreferenceMode,
      savedMemberTargets
    };
  }

  return {
    calories: input.recommended.calorieTarget,
    proteinG: input.recommended.proteinTargetG,
    carbsG: input.recommended.carbsTargetG,
    fatG: input.recommended.fatTargetG,
    waterMl: input.recommended.waterTargetMl,
    source: input.bodyScanUsed ? "body_scan" : "ascend_recommendation",
    sourceLabel: input.bodyScanUsed ? "Body Scan + Ascend" : "Ascend Recommendation",
    explanation: input.recommended.adaptationReason ?? input.recommended.explanation,
    updatedAt: null,
    editableByMember: true,
    memberPreferenceMode,
    savedMemberTargets
  };
}

export async function resolveNutritionTargets(userId: string): Promise<ResolvedNutritionTargets> {
  const [profileResult, weightsResult, coachPlanResult, preferenceResult] = await Promise.all([
    query<{
      goal_type: "fat_loss" | "muscle_gain" | "maintenance" | null;
      gender: "female" | "male" | "prefer_not_to_say" | null;
      age_years: number | string | null;
      height_cm: number | string | null;
      starting_weight_kg: number | string | null;
      target_weight_kg: number | string | null;
      activity_level: "low" | "moderate" | "high" | null;
      athlete_mode_enabled: boolean;
    }>(`
      select u.goal_type, u.gender, u.age_years, u.height_cm, u.starting_weight_kg,
        u.target_weight_kg, u.activity_level, coalesce(ap.enabled, false) as athlete_mode_enabled
      from users u
      left join athlete_profiles ap on ap.user_id = u.id
      where u.id = $1
    `, [userId]),
    query<{ weight_kg: number | string; logged_at: string }>(`
      select weight_kg, logged_at from weight_logs
      where user_id = $1 order by logged_at desc limit 20
    `, [userId]),
    query<StoredTargets>(`
      select calories, protein_g, carbs_g, fat_g, updated_at
      from coach_nutrition_plans
      where user_id = $1 and status = 'active'
      order by updated_at desc limit 1
    `, [userId]),
    query<MemberPreference>(`
      select mode, calories, protein_g, carbs_g, fat_g, updated_at
      from member_nutrition_preferences where user_id = $1
    `, [userId])
  ]);

  const profile = profileResult.rows[0];
  if (!profile) {
    const error = new Error("User profile not found.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const scans = profile.athlete_mode_enabled
    ? await query(`
        select * from body_composition_scans
        where user_id = $1 and user_confirmed = true
        order by scan_date desc, created_at desc limit 10
      `, [userId])
    : { rows: [] };
  const bodyComposition = profile.athlete_mode_enabled
    ? bodyCompositionForNutrition(scans.rows.map(bodyCompositionScanFromDb))
    : undefined;
  const latestWeight = weightsResult.rows[0]?.weight_kg ?? profile.starting_weight_kg;
  const recommended = calculateAdaptiveNutritionTargets({
    goalType: profile.goal_type,
    sex: profile.gender,
    ageYears: profile.age_years,
    heightCm: profile.height_cm,
    weightKg: latestWeight,
    targetWeightKg: profile.target_weight_kg,
    activityLevel: profile.activity_level,
    bodyComposition
  }, weightsResult.rows.map((row) => ({ weightKg: row.weight_kg, loggedAt: row.logged_at })));

  return applyNutritionTargetPrecedence({
    recommended,
    coachPlan: coachPlanResult.rows[0] ?? null,
    memberPreference: preferenceResult.rows[0] ?? null,
    bodyScanUsed: Boolean(bodyComposition)
  });
}

export async function saveMemberNutritionPreference(
  userId: string,
  input: z.infer<typeof memberNutritionPreferenceSchema>
) {
  const activeCoachPlan = await query("select 1 from coach_nutrition_plans where user_id = $1 and status = 'active' limit 1", [userId]);
  if (activeCoachPlan.rowCount) {
    const error = new Error("Your coach currently controls these targets. Ask your coach before changing the plan.");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  await query(`
    insert into member_nutrition_preferences (user_id, mode, calories, protein_g, carbs_g, fat_g)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (user_id) do update set
      mode = excluded.mode,
      calories = excluded.calories,
      protein_g = excluded.protein_g,
      carbs_g = excluded.carbs_g,
      fat_g = excluded.fat_g,
      updated_at = now()
  `, [
    userId,
    input.mode,
    input.mode === "custom" ? input.calories : null,
    input.mode === "custom" ? input.proteinG : null,
    input.mode === "custom" ? input.carbsG : null,
    input.mode === "custom" ? input.fatG : null
  ]);

  return resolveNutritionTargets(userId);
}
