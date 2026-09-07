import { z } from "zod";
import { normalizeAscendLocale, type AscendLocale } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { createBodyScanExplanationReply, createBodyScanFollowUpReply } from "../integrations/openai";
import { AuthUser } from "../middleware/auth";
import { BodyCompositionScan, bodyCompositionScanFromDb, getTrustedBodyCompositionHistory } from "./bodyCompositionService";
import { logAiUsage } from "./aiUsageService";

export const BODY_SCAN_EXPLANATION_PROMPT_VERSION = "body-scan-introductory-v1";
export const BODY_SCAN_FOLLOWUP_PROMPT_VERSION = "body-scan-followup-v1";

export function localizedBodyScanPromptVersion(version: string, locale: AscendLocale) {
  return `${version}:${locale}`;
}

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

export function resolveBodyScanIntroductoryAccess(input: {
  publicEnabled: boolean;
  ownerPreviewEnabled: boolean;
  user: Pick<AuthUser, "isPlatformOwner">;
  hasBaseline: boolean;
}) {
  const ownerPreview = input.ownerPreviewEnabled && input.user.isPlatformOwner;
  const enabled = input.publicEnabled || ownerPreview;
  return {
    enabled,
    experience: "introductory" as const,
    rollout: (input.publicEnabled ? "public" : ownerPreview ? "owner_preview" : "disabled") as "public" | "owner_preview" | "disabled",
    canCapture: enabled && !input.hasBaseline,
    canViewBaseline: enabled,
    canCompareScans: false,
    canViewDna: false,
    canUseScanForNutrition: false,
    followUpLimit: 2 as const,
    captureLimit: 1 as const,
    capturesUsed: input.hasBaseline ? 1 as const : 0 as const,
    capturesRemaining: enabled && !input.hasBaseline ? 1 as const : 0 as const
  };
}

export function bodyScanPreviewAccess(user: AuthUser, hasBaseline = false) {
  return resolveBodyScanIntroductoryAccess({
    publicEnabled: env.BODY_SCAN_UNIVERSAL_PUBLIC,
    ownerPreviewEnabled: env.BODY_SCAN_UNIVERSAL_OWNER_PREVIEW,
    user,
    hasBaseline
  });
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
    `select * from body_composition_scans where user_id = $1 and user_confirmed = true and experience_scope = 'introductory' order by scan_date desc, created_at desc limit 20`,
    [userId]
  );
  return getTrustedBodyCompositionHistory(result.rows.map((row) => bodyCompositionScanFromDb(row))).latestConfirmedScan;
}

export async function confirmedBodyScanById(userId: string, scanId: string) {
  const result = await query(
    `select * from body_composition_scans where id = $1 and user_id = $2 and user_confirmed = true and experience_scope = 'introductory' limit 1`,
    [scanId, userId]
  );
  return result.rows[0] ? getTrustedBodyCompositionHistory([bodyCompositionScanFromDb(result.rows[0])]).latestConfirmedScan : null;
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
  const missing = new Set(scan.missingFields ?? []);
  const confirmed = (field: string, value: number | null | undefined) => missing.has(field) ? null : value ?? null;
  const leanBodyMassKg = !missing.has("leanBodyMassKg")
    ? scan.leanBodyMassKg ?? null
    : !missing.has("estimatedLeanBodyMassKg")
      ? scan.estimatedLeanBodyMassKg ?? null
      : null;
  const skeletalMuscleMassKg = !missing.has("skeletalMuscleMassKg")
    ? scan.skeletalMuscleMassKg ?? null
    : !missing.has("muscleMassKg")
      ? scan.muscleMassKg ?? null
      : null;
  return {
    context: "first confirmed scan baseline",
    memberName: profile.fullName,
    statedGoal: profile.goalType,
    scanDate: scan.scanDate,
    machine: scan.machine ?? null,
    confirmedReadings: {
      weightKg: confirmed("weightKg", scan.weightKg),
      bmi: confirmed("bmi", scan.bmi),
      bodyFatPercent: confirmed("bodyFatPercent", scan.bodyFatPercent),
      fatMassKg: confirmed("fatMassKg", scan.fatMassKg),
      leanBodyMassKg,
      skeletalMuscleMassKg,
      visceralFat: confirmed("visceralFat", scan.visceralFat),
      bodyWaterPercent: confirmed("bodyWaterPercent", scan.bodyWaterPercent),
      bmrKcal: confirmed("bmrKcal", scan.bmrKcal)
    },
    extractionConfidence: scan.confidenceScore ?? null,
    missingFields: scan.missingFields ?? [],
    recommendedRescanWindowWeeks: { minimum: 4, maximum: 6 },
    comparisonAllowed: false,
    nutritionRecalculationAllowed: false
  };
}

export function fallbackIntroductoryExplanation(scan: BodyCompositionScan, profile: BaselineProfile, localeInput: AscendLocale = "en"): BodyScanExplanation {
  const locale = normalizeAscendLocale(localeInput);
  const copy = locale === "ms-MY" ? {
    goalFatLoss: "Imbasan ini menjadi titik permulaan untuk mengurangkan lemak badan sambil melindungi otot yang sedia ada.",
    goalMuscle: "Imbasan ini menjadi titik permulaan untuk membina otot sambil memantau komposisi badan secara menyeluruh.",
    goalOther: "Imbasan ini menjadi titik permulaan yang berguna untuk melihat perubahan komposisi badan dari semasa ke semasa.",
    bodyFat: "Lemak badan", bodyFatMeaning: "Ini ialah bahagian berat badan semasa yang diukur sebagai lemak. Imbasan akan datang lebih berguna jika dibuat dalam keadaan yang serupa.",
    muscle: "Otot rangka", muscleMeaning: "Ini ialah bacaan otot yang akan dipantau oleh Ascend apabila latihan dan pemakanan diteruskan.",
    weight: "Berat", weightMeaning: "Berat memberi konteks, tetapi tidak dapat menunjukkan sama ada perubahan akan datang berpunca daripada lemak, otot, air atau turun naik biasa.",
    visceral: "Bacaan lemak viseral", visceralMeaning: "Bacaan mesin ini memberi konteks tentang lemak abdomen, tetapi ia ialah maklumat kecergasan dan bukan diagnosis perubatan.",
    baseline: "Garis dasar imbasan", confirmed: "Imbasan disahkan", baselineMeaning: "Laporan yang disahkan ini kini menjadi titik rujukan. Satu lagi imbasan setara diperlukan sebelum Ascend boleh membincangkan perubahan.",
    headline: "Imbasan anda kini menjadi titik permulaan yang berguna.",
    train: "Berlatih secara konsisten", trainAction: "Gunakan latihan rintangan progresif sebagai asas untuk membina otot.",
    support: "Sokong usaha anda", supportAction: "Pastikan protein dan pengambilan makanan keseluruhan cukup konsisten untuk menyokong latihan.",
    recover: "Utamakan pemulihan", recoverAction: "Berikan tidur dan pemulihan yang mencukupi selepas sesi berat sebelum mengulanginya.",
    protect: "Lindungi otot", protectAction: "Kekalkan latihan rintangan dalam minggu anda dan jangan hanya mengejar penurunan angka penimbang.",
    protein: "Konsisten dengan protein", proteinAction: "Bina hidangan berasaskan sumber protein praktikal yang mudah diulangi.",
    move: "Kekal aktif", moveAction: "Gunakan pergerakan harian yang tetap untuk menyokong kemajuan tanpa perubahan melampau.",
    measurement: "Bacaan komposisi badan boleh berubah mengikut hidrasi, makanan, glikogen, latihan terkini dan waktu imbasan. Perbezaan kecil tidak semestinya menunjukkan perubahan badan yang bermakna.",
    rescan: "Untuk perbandingan yang lebih jelas, ulangi imbasan dalam kira-kira 4–6 minggu dalam keadaan yang serupa.",
    safety: "Gunakan bacaan ini sebagai panduan kecergasan, bukan diagnosis perubatan. Rujuk profesional kesihatan bertauliah bagi sebarang kebimbangan kesihatan."
  } : locale === "zh-Hans" ? {
    goalFatLoss: "这次扫描可作为降低体脂并保护现有肌肉的起点。",
    goalMuscle: "这次扫描可作为增肌并持续关注整体身体成分的起点。",
    goalOther: "这次扫描为观察身体成分随时间变化提供了有用起点。",
    bodyFat: "体脂", bodyFatMeaning: "这是当前体重中被测量为脂肪的比例。以后在相似条件下扫描，结果会更有参考价值。",
    muscle: "骨骼肌", muscleMeaning: "这是目前的肌肉读数。随着训练和饮食继续，Ascend 会关注它的变化。",
    weight: "体重", weightMeaning: "体重提供背景信息，但无法单独说明未来变化来自脂肪、肌肉、水分还是正常波动。",
    visceral: "内脏脂肪读数", visceralMeaning: "该机器读数提供腹部脂肪的参考信息，但属于健身数据，并非医学诊断。",
    baseline: "扫描基线", confirmed: "已确认扫描", baselineMeaning: "这份已确认报告现已成为参考起点。需要另一次条件相近的扫描后，Ascend 才能讨论变化。",
    headline: "你的扫描现在是一个有用的起点。",
    train: "稳定训练", trainAction: "以循序渐进的抗阻训练作为增肌的主要刺激。",
    support: "支持训练", supportAction: "保持足够稳定的蛋白质和整体饮食摄入，以支持训练。",
    recover: "重视恢复", recoverAction: "高强度训练后先获得充足睡眠和恢复，再重复训练。",
    protect: "保护肌肉", protectAction: "每周保留抗阻训练，不要只追求体重数字下降。",
    protein: "稳定摄入蛋白质", proteinAction: "每餐围绕一种容易长期坚持的实用蛋白质来源安排。",
    move: "保持活动", moveAction: "用规律的日常活动支持进度，不依赖极端改变。",
    measurement: "身体成分读数会受到水分、食物、糖原、近期训练和测量时间影响。细微差异并不一定代表身体出现了实质变化。",
    rescan: "为了获得更清晰的比较，请在约 4–6 周后，于相似条件下再次扫描。",
    safety: "请把这些读数用于健身参考，而非医学诊断。如有健康疑虑，请咨询合格的医疗专业人士。"
  } : {
    goalFatLoss: "This scan gives you a starting point for reducing body fat while protecting the muscle you already have.",
    goalMuscle: "This scan gives you a starting point for building muscle while keeping the rest of your body composition in view.",
    goalOther: "This scan gives you a useful starting point for watching how your body composition changes over time.",
    bodyFat: "Body fat", bodyFatMeaning: "This is the portion of your current body weight measured as fat. Future scans are more useful when taken under similar conditions.",
    muscle: "Skeletal muscle", muscleMeaning: "This is the muscle reading Ascend will watch as your training and nutrition continue.",
    weight: "Weight", weightMeaning: "Weight is useful context, but it cannot show whether a future change came from fat, muscle, water, or normal fluctuation.",
    visceral: "Visceral fat reading", visceralMeaning: "This machine reading adds context around abdominal fat, but it is fitness information rather than a medical diagnosis.",
    baseline: "Scan baseline", confirmed: "Confirmed scan", baselineMeaning: "This confirmed report is now your reference point. Another comparable scan is needed before Ascend can discuss change.",
    headline: "Your scan is now a useful starting point.",
    train: "Train consistently", trainAction: "Use progressive resistance training as the main signal for building muscle.",
    support: "Support the work", supportAction: "Keep protein and overall food intake consistent enough to support training.",
    recover: "Make recovery count", recoverAction: "Give hard sessions enough sleep and recovery before repeating them.",
    protect: "Protect muscle", protectAction: "Keep resistance training in your week rather than chasing scale loss alone.",
    protein: "Make protein reliable", proteinAction: "Build meals around a practical protein source you can repeat.",
    move: "Keep moving", moveAction: "Use regular daily movement to support progress without relying on extreme changes.",
    measurement: "Body-composition readings can move with hydration, food, glycogen, recent training, and time of day. Small differences do not always represent a meaningful body change.",
    rescan: "For a clearer comparison, repeat the scan in roughly 4–6 weeks under similar conditions.",
    safety: "Use these readings for fitness guidance, not medical diagnosis. Speak with a qualified health professional about health concerns."
  };
  const goalCopy = profile.goalType === "fat_loss" ? copy.goalFatLoss : profile.goalType === "muscle_gain" ? copy.goalMuscle : copy.goalOther;
  const importantNumbers = [
    scan.bodyFatPercent !== null && scan.bodyFatPercent !== undefined ? {
      label: copy.bodyFat,
      value: numberText(scan.bodyFatPercent, "%")!,
      meaning: copy.bodyFatMeaning
    } : null,
    (scan.skeletalMuscleMassKg ?? scan.muscleMassKg) !== null && (scan.skeletalMuscleMassKg ?? scan.muscleMassKg) !== undefined ? {
      label: copy.muscle,
      value: numberText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, " kg")!,
      meaning: copy.muscleMeaning
    } : null,
    scan.weightKg !== null && scan.weightKg !== undefined ? {
      label: copy.weight,
      value: numberText(scan.weightKg, " kg")!,
      meaning: copy.weightMeaning
    } : null,
    scan.visceralFat !== null && scan.visceralFat !== undefined ? {
      label: copy.visceral,
      value: numberText(scan.visceralFat, "")!,
      meaning: copy.visceralMeaning
    } : null
  ].filter((value): value is NonNullable<typeof value> => Boolean(value)).slice(0, 3);

  while (importantNumbers.length < 2) {
    importantNumbers.push({
      label: importantNumbers.length ? copy.baseline : copy.confirmed,
      value: scan.scanDate,
      meaning: copy.baselineMeaning
    });
  }

  const priorities = profile.goalType === "muscle_gain"
    ? [
        { title: copy.train, action: copy.trainAction },
        { title: copy.support, action: copy.supportAction },
        { title: copy.recover, action: copy.recoverAction }
      ]
    : [
        { title: copy.protect, action: copy.protectAction },
        { title: copy.protein, action: copy.proteinAction },
        { title: copy.move, action: copy.moveAction }
      ];

  return {
    headline: copy.headline,
    summary: goalCopy,
    importantNumbers,
    priorities,
    measurementNote: copy.measurement,
    nextScanGuidance: copy.rescan,
    safetyNote: copy.safety
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

function structuredHanCharacterCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + structuredHanCharacterCount(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + structuredHanCharacterCount(item), 0);
  if (typeof value !== "string") return 0;
  return (value.match(/[\u3400-\u9fff]/g) ?? []).length;
}

function structuredNumbers(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(structuredNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(structuredNumbers);
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0])).filter(Number.isFinite);
}

export function parseBodyScanExplanation(value: string, fallback: BodyScanExplanation, allowedNumbers?: number[], locale: AscendLocale = "en") {
  try {
    const parsed = bodyScanExplanationSchema.parse(JSON.parse(cleanJson(value)));
    if (locale === "zh-Hans") {
      const characters = structuredHanCharacterCount(parsed);
      if (characters < 120 || characters > 800) return fallback;
    } else {
      const words = structuredWordCount(parsed);
      if (words < 150 || words > 200) return fallback;
    }
    if (allowedNumbers) {
      const unsupportedNumber = structuredNumbers(parsed).some((number) => (
        !allowedNumbers.some((allowed) => Math.abs(allowed - number) < 0.01)
      ));
      if (unsupportedNumber) return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export async function getCachedBodyScanExplanation(userId: string, scanId: string, locale: AscendLocale = "en") {
  const promptVersion = localizedBodyScanPromptVersion(BODY_SCAN_EXPLANATION_PROMPT_VERSION, locale);
  const result = await query<ExplanationRow>(
    `select id, explanation, source, provider, model from body_scan_explanations where user_id = $1 and scan_id = $2 and access_depth = 'introductory' and prompt_version = $3 limit 1`,
    [userId, scanId, promptVersion]
  );
  return result.rows[0] ?? null;
}

export async function getOrCreateBodyScanExplanation(userId: string, scan: BodyCompositionScan, locale: AscendLocale = "en") {
  if (!scan.id) throw new Error("Confirmed Body Scan is missing an identifier.");
  const promptVersion = localizedBodyScanPromptVersion(BODY_SCAN_EXPLANATION_PROMPT_VERSION, locale);
  const cached = await getCachedBodyScanExplanation(userId, scan.id, locale);
  if (cached) {
    const followUps = await bodyScanFollowUps(userId, scan.id, cached.id);
    return { ...cached, followUps, followUpsRemaining: Math.max(0, 2 - followUps.length), cacheHit: true };
  }

  const profile = await baselineProfile(userId);
  const facts = introductoryScanFacts(scan, profile);
  const fallback = fallbackIntroductoryExplanation(scan, profile, locale);
  const reply = await createBodyScanExplanationReply(facts, JSON.stringify(fallback), locale);
  const explanation = parseBodyScanExplanation(reply.text, fallback, structuredNumbers(facts), locale);
  const source = reply.source === "ai" && explanation !== fallback ? "ai" as const : "fallback" as const;
  const result = await query<ExplanationRow>(
    `
    insert into body_scan_explanations (scan_id, user_id, access_depth, prompt_version, explanation, source, provider, model)
    values ($1, $2, 'introductory', $3, $4, $5, $6, $7)
    on conflict (scan_id, access_depth, prompt_version) do update set updated_at = body_scan_explanations.updated_at
    returning id, explanation, source, provider, model
    `,
    [scan.id, userId, promptVersion, explanation, source, reply.provider, reply.model]
  );
  await logAiUsage({
    userId,
    eventType: "body_scan_explanation",
    provider: reply.provider,
    model: reply.model,
    status: source === "ai" ? "success" : "fallback",
    metadata: { scanId: scan.id, promptVersion, locale, accessDepth: "introductory" }
  });
  return { ...result.rows[0], followUps: [], followUpsRemaining: 2, cacheHit: false };
}

export async function bodyScanFollowUps(userId: string, scanId: string, explanationId?: string) {
  const result = await query<{ id: string; question: string; answer: string; slot: number; created_at: string }>(
    `select id, question, answer, slot, created_at from body_scan_followups where user_id = $1 and scan_id = $2 and ($3::uuid is null or explanation_id = $3) and answer <> '' order by slot`,
    [userId, scanId, explanationId ?? null]
  );
  return result.rows;
}

function fallbackFollowUpAnswer(question: string, locale: AscendLocale) {
  if (locale === "ms-MY") return `Imbasan yang disahkan boleh menerangkan bacaan dalam laporan, tetapi satu imbasan belum dapat membuktikan trend. Bagi “${question.slice(0, 80)}”, gunakan ini sebagai garis dasar dan bandingkan dengan imbasan kemudian dalam keadaan yang serupa. Fokus pada satu tindakan berulang yang menyokong matlamat anda, bukan bertindak berdasarkan satu angka.`;
  if (locale === "zh-Hans") return `已确认的扫描可以帮助解释报告中的读数，但一次扫描无法证明趋势。关于“${question.slice(0, 80)}”，请把本次结果作为基线，并与以后在相似条件下完成的扫描比较。先专注于一项能够支持目标、可以重复执行的行动，不要因单一数字而仓促调整。`;
  return `Your confirmed scan can help explain the readings shown on the report, but one scan cannot prove a trend. For “${question.slice(0, 80)}”, use this as your baseline and compare a later scan taken under similar conditions. Focus on one repeatable action that supports your goal rather than reacting to a single number.`;
}

export async function createBodyScanFollowUp(userId: string, scan: BodyCompositionScan, question: string, locale: AscendLocale = "en") {
  if (!scan.id) throw new Error("Confirmed Body Scan is missing an identifier.");
  const explanation = await getOrCreateBodyScanExplanation(userId, scan, locale);
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
  const fallback = { answer: fallbackFollowUpAnswer(question, locale) };
  const reply = await createBodyScanFollowUpReply({
    facts: introductoryScanFacts(scan, profile),
    explanation: explanation.explanation,
    question,
    fallbackJson: JSON.stringify(fallback),
    locale
  });
  let parsed = fallback;
  try {
    const candidate = followUpSchema.parse(JSON.parse(cleanJson(reply.text)));
    parsed = locale === "zh-Hans"
      ? structuredHanCharacterCount(candidate.answer) <= 500 ? candidate : fallback
      : structuredWordCount(candidate.answer) <= 120 ? candidate : fallback;
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
    metadata: { scanId: scan.id, promptVersion: localizedBodyScanPromptVersion(BODY_SCAN_FOLLOWUP_PROMPT_VERSION, locale), locale, slot: reservation.rows[0].slot }
  });
  const followUps = await bodyScanFollowUps(userId, scan.id, explanation.id);
  return { followUp: updated.rows[0], followUpsRemaining: Math.max(0, 2 - followUps.length) };
}
