import { z } from "zod";
import { env } from "../config/env";
import { query } from "../db/pool";
import { createBodyScanExplanationReply, createBodyScanFollowUpReply } from "../integrations/openai";
import { AuthUser } from "../middleware/auth";
import { BodyCompositionScan, bodyCompositionScanFromDb } from "./bodyCompositionService";
import { logAiUsage } from "./aiUsageService";

export const BODY_SCAN_EXPLANATION_PROMPT_VERSION = "body-scan-introductory-v1";
export const BODY_SCAN_FOLLOWUP_PROMPT_VERSION = "body-scan-followup-v1";

const importantNumberSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(80),
  meaning: z.string().trim().min(1).max(300)
});

const prioritySchema = z.object({
  title: z.string().trim().min(1).max(100),
  action: z.string().trim().min(1).max(300)
});

export const bodyScanExplanationSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1200),
  importantNumbers: z.array(importantNumberSchema).min(2).max(3),
  priorities: z.array(prioritySchema).min(2).max(3),
  measurementNote: z.string().trim().min(1).max(500),
  nextScanGuidance: z.string().trim().min(1).max(300),
  safetyNote: z.string().trim().min(1).max(300)
});

export type BodyScanExplanation = z.infer<typeof bodyScanExplanationSchema>;

const followUpSchema = z.object({ answer: z.string().trim().min(1).max(1200) });

type BaselineProfile = {
  fullName: string | null;
  goalType: "fat_loss" | "muscle_gain" | "maintenance" | null;
};

type ExplanationRow = {
  id: string;
  explanation: BodyScanExplanation;
  source: "ai" | "fallback";
  provider: string | null;
  model: string | null;
};

export function resolveOwnerBodyScanPreviewAccess(input: { featureEnabled: boolean; user: Pick<AuthUser, "isPlatformOwner"> }) {
  const enabled = input.featureEnabled && input.user.isPlatformOwner;
  return {
    enabled,
    experience: "introductory" as const,
    canCapture: enabled,
    canViewBaseline: enabled,
    canCompareScans: false,
    canViewDna: false,
    canUseScanForNutrition: false,
    followUpLimit: 2
  };
}

export function bodyScanPreviewAccess(user: AuthUser) {
  return resolveOwnerBodyScanPreviewAccess({ featureEnabled: env.BODY_SCAN_UNIVERSAL_OWNER_PREVIEW, user });
}

export function introductoryBaseline(scan: BodyCompositionScan | null) {
  if (!scan?.id) return null;
  return {
    id: scan.id,
    scanDate: scan.scanDate,
    machine: scan.machine ?? null,
    weightKg: scan.weightKg ?? null,
    bmi: scan.bmi ?? null,
    bodyFatPercent: scan.bodyFatPercent ?? null,
    fatMassKg: scan.fatMassKg ?? null,
    leanBodyMassKg: scan.leanBodyMassKg ?? scan.estimatedLeanBodyMassKg ?? null,
    skeletalMuscleMassKg: scan.skeletalMuscleMassKg ?? scan.muscleMassKg ?? null,
    visceralFat: scan.visceralFat ?? null,
    bodyWaterPercent: scan.bodyWaterPercent ?? null,
    bmrKcal: scan.bmrKcal ?? null,
    confidenceScore: scan.confidenceScore ?? null,
    sourceImageUrl: scan.sourceImages?.[0]?.url ?? null
  };
}

export async function latestConfirmedBodyScan(userId: string) {
  const result = await query(
    `select * from body_composition_scans where user_id = $1 and user_confirmed = true and experience_scope = 'introductory' order by scan_date desc, created_at desc limit 1`,
    [userId]
  );
  return result.rows[0] ? bodyCompositionScanFromDb(result.rows[0]) : null;
}

export async function confirmedBodyScanById(userId: string, scanId: string) {
  const result = await query(
    `select * from body_composition_scans where id = $1 and user_id = $2 and user_confirmed = true and experience_scope = 'introductory' limit 1`,
    [scanId, userId]
  );
  return result.rows[0] ? bodyCompositionScanFromDb(result.rows[0]) : null;
}

async function baselineProfile(userId: string): Promise<BaselineProfile> {
  const result = await query<{ full_name: string | null; goal_type: BaselineProfile["goalType"] }>(
    "select full_name, goal_type from users where id = $1",
    [userId]
  );
  return {
    fullName: result.rows[0]?.full_name ?? null,
    goalType: result.rows[0]?.goal_type ?? null
  };
}

function numberText(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
}

export function introductoryScanFacts(scan: BodyCompositionScan, profile: BaselineProfile) {
  return {
    context: "first confirmed scan baseline",
    memberName: profile.fullName,
    statedGoal: profile.goalType,
    scanDate: scan.scanDate,
    machine: scan.machine ?? null,
    confirmedReadings: {
      weightKg: scan.weightKg ?? null,
      bmi: scan.bmi ?? null,
      bodyFatPercent: scan.bodyFatPercent ?? null,
      fatMassKg: scan.fatMassKg ?? null,
      leanBodyMassKg: scan.leanBodyMassKg ?? scan.estimatedLeanBodyMassKg ?? null,
      skeletalMuscleMassKg: scan.skeletalMuscleMassKg ?? scan.muscleMassKg ?? null,
      visceralFat: scan.visceralFat ?? null,
      bodyWaterPercent: scan.bodyWaterPercent ?? null,
      bmrKcal: scan.bmrKcal ?? null
    },
    extractionConfidence: scan.confidenceScore ?? null,
    missingFields: scan.missingFields ?? [],
    comparisonAllowed: false,
    nutritionRecalculationAllowed: false
  };
}

export function fallbackIntroductoryExplanation(scan: BodyCompositionScan, profile: BaselineProfile): BodyScanExplanation {
  const goalCopy = profile.goalType === "fat_loss"
    ? "This scan gives you a starting point for reducing body fat while protecting the muscle you already have."
    : profile.goalType === "muscle_gain"
      ? "This scan gives you a starting point for building muscle while keeping the rest of your body composition in view."
      : "This scan gives you a useful starting point for watching how your body composition changes over time.";
  const importantNumbers = [
    scan.bodyFatPercent !== null && scan.bodyFatPercent !== undefined ? {
      label: "Body fat",
      value: numberText(scan.bodyFatPercent, "%")!,
      meaning: "This is the portion of your current body weight measured as fat. Future scans are more useful when taken under similar conditions."
    } : null,
    (scan.skeletalMuscleMassKg ?? scan.muscleMassKg) !== null && (scan.skeletalMuscleMassKg ?? scan.muscleMassKg) !== undefined ? {
      label: "Skeletal muscle",
      value: numberText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, " kg")!,
      meaning: "This is the muscle reading Ascend will watch as your training and nutrition continue."
    } : null,
    scan.weightKg !== null && scan.weightKg !== undefined ? {
      label: "Weight",
      value: numberText(scan.weightKg, " kg")!,
      meaning: "Weight is useful context, but it cannot show whether a future change came from fat, muscle, water, or normal fluctuation."
    } : null,
    scan.visceralFat !== null && scan.visceralFat !== undefined ? {
      label: "Visceral fat reading",
      value: numberText(scan.visceralFat, "")!,
      meaning: "This machine reading adds context around abdominal fat, but it is fitness information rather than a medical diagnosis."
    } : null
  ].filter((value): value is NonNullable<typeof value> => Boolean(value)).slice(0, 3);

  while (importantNumbers.length < 2) {
    importantNumbers.push({
      label: importantNumbers.length ? "Scan baseline" : "Confirmed scan",
      value: scan.scanDate,
      meaning: "This confirmed report is now your reference point. Another comparable scan is needed before Ascend can discuss change."
    });
  }

  const priorities = profile.goalType === "muscle_gain"
    ? [
        { title: "Train consistently", action: "Use progressive resistance training as the main signal for building muscle." },
        { title: "Support the work", action: "Keep protein and overall food intake consistent enough to support training." },
        { title: "Make recovery count", action: "Give hard sessions enough sleep and recovery before repeating them." }
      ]
    : [
        { title: "Protect muscle", action: "Keep resistance training in your week rather than chasing scale loss alone." },
        { title: "Make protein reliable", action: "Build meals around a practical protein source you can repeat." },
        { title: "Keep moving", action: "Use regular daily movement to support progress without relying on extreme changes." }
      ];

  return {
    headline: "Your scan is now a useful starting point.",
    summary: goalCopy,
    importantNumbers,
    priorities,
    measurementNote: "Body-composition readings can move with hydration, food, glycogen, recent training, and time of day. Small differences do not always represent a meaningful body change.",
    nextScanGuidance: "For a clearer comparison, repeat the scan in roughly 4–6 weeks under similar conditions.",
    safetyNote: "Use these readings for fitness guidance, not medical diagnosis. Speak with a qualified health professional about health concerns."
  };
}

function cleanJson(value: string) {
  return value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function structuredWordCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + structuredWordCount(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + structuredWordCount(item), 0);
  if (typeof value !== "string") return 0;
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function parseBodyScanExplanation(value: string, fallback: BodyScanExplanation) {
  try {
    const parsed = bodyScanExplanationSchema.parse(JSON.parse(cleanJson(value)));
    const words = structuredWordCount(parsed);
    return words >= 150 && words <= 200 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function getCachedBodyScanExplanation(userId: string, scanId: string) {
  const result = await query<ExplanationRow>(
    `select id, explanation, source, provider, model from body_scan_explanations where user_id = $1 and scan_id = $2 and access_depth = 'introductory' and prompt_version = $3 limit 1`,
    [userId, scanId, BODY_SCAN_EXPLANATION_PROMPT_VERSION]
  );
  return result.rows[0] ?? null;
}

export async function getOrCreateBodyScanExplanation(userId: string, scan: BodyCompositionScan) {
  if (!scan.id) throw new Error("Confirmed Body Scan is missing an identifier.");
  const cached = await getCachedBodyScanExplanation(userId, scan.id);
  if (cached) {
    const followUps = await bodyScanFollowUps(userId, scan.id);
    return { ...cached, followUps, followUpsRemaining: Math.max(0, 2 - followUps.length), cacheHit: true };
  }

  const profile = await baselineProfile(userId);
  const facts = introductoryScanFacts(scan, profile);
  const fallback = fallbackIntroductoryExplanation(scan, profile);
  const reply = await createBodyScanExplanationReply(facts, JSON.stringify(fallback));
  const explanation = parseBodyScanExplanation(reply.text, fallback);
  const source = reply.source === "ai" && explanation !== fallback ? "ai" as const : "fallback" as const;
  const result = await query<ExplanationRow>(
    `
    insert into body_scan_explanations (scan_id, user_id, access_depth, prompt_version, explanation, source, provider, model)
    values ($1, $2, 'introductory', $3, $4, $5, $6, $7)
    on conflict (scan_id, access_depth, prompt_version) do update set updated_at = body_scan_explanations.updated_at
    returning id, explanation, source, provider, model
    `,
    [scan.id, userId, BODY_SCAN_EXPLANATION_PROMPT_VERSION, explanation, source, reply.provider, reply.model]
  );
  await logAiUsage({
    userId,
    eventType: "body_scan_explanation",
    provider: reply.provider,
    model: reply.model,
    status: source === "ai" ? "success" : "fallback",
    metadata: { scanId: scan.id, promptVersion: BODY_SCAN_EXPLANATION_PROMPT_VERSION, accessDepth: "introductory" }
  });
  return { ...result.rows[0], followUps: [], followUpsRemaining: 2, cacheHit: false };
}

export async function bodyScanFollowUps(userId: string, scanId: string) {
  const result = await query<{ id: string; question: string; answer: string; slot: number; created_at: string }>(
    `select id, question, answer, slot, created_at from body_scan_followups where user_id = $1 and scan_id = $2 and answer <> '' order by slot`,
    [userId, scanId]
  );
  return result.rows;
}

function fallbackFollowUpAnswer(question: string) {
  return `Your confirmed scan can help explain the readings shown on the report, but one scan cannot prove a trend. For “${question.slice(0, 80)}”, use this as your baseline and compare a later scan taken under similar conditions. Focus on one repeatable action that supports your goal rather than reacting to a single number.`;
}

export async function createBodyScanFollowUp(userId: string, scan: BodyCompositionScan, question: string) {
  if (!scan.id) throw new Error("Confirmed Body Scan is missing an identifier.");
  const explanation = await getOrCreateBodyScanExplanation(userId, scan);
  const reservation = await query<{ id: string; slot: number }>(
    `
    insert into body_scan_followups (explanation_id, scan_id, user_id, slot, question)
    select $1, $2, $3, slot, $4
    from (values (1), (2)) as available(slot)
    where not exists (
      select 1 from body_scan_followups existing where existing.explanation_id = $1 and existing.slot = available.slot
    )
    order by slot
    limit 1
    on conflict do nothing
    returning id, slot
    `,
    [explanation.id, scan.id, userId, question]
  );
  if (!reservation.rows[0]) {
    const error = new Error("You have used both introductory questions for this scan. Premium will unlock ongoing scan conversations.");
    (error as Error & { status?: number }).status = 429;
    throw error;
  }

  const profile = await baselineProfile(userId);
  const fallback = { answer: fallbackFollowUpAnswer(question) };
  const reply = await createBodyScanFollowUpReply({
    facts: introductoryScanFacts(scan, profile),
    explanation: explanation.explanation,
    question,
    fallbackJson: JSON.stringify(fallback)
  });
  let parsed = fallback;
  try {
    const candidate = followUpSchema.parse(JSON.parse(cleanJson(reply.text)));
    parsed = structuredWordCount(candidate.answer) <= 120 ? candidate : fallback;
  } catch {
    parsed = fallback;
  }
  const source = reply.source === "ai" && parsed !== fallback ? "ai" as const : "fallback" as const;
  const updated = await query<{ id: string; question: string; answer: string; slot: number; created_at: string }>(
    `update body_scan_followups set answer = $2, source = $3, provider = $4, model = $5, updated_at = now() where id = $1 returning id, question, answer, slot, created_at`,
    [reservation.rows[0].id, parsed.answer, source, reply.provider, reply.model]
  );
  await logAiUsage({
    userId,
    eventType: "body_scan_followup",
    provider: reply.provider,
    model: reply.model,
    status: source === "ai" ? "success" : "fallback",
    metadata: { scanId: scan.id, promptVersion: BODY_SCAN_FOLLOWUP_PROMPT_VERSION, slot: reservation.rows[0].slot }
  });
  const followUps = await bodyScanFollowUps(userId, scan.id);
  return { followUp: updated.rows[0], followUpsRemaining: Math.max(0, 2 - followUps.length) };
}
