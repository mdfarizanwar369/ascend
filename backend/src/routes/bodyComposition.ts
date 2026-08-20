import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { NutritionTargetInput } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { uploadDataUrl, createReadUrl } from "../integrations/s3";
import { extractBodyCompositionFromImages } from "../integrations/openai";
import { requireAuth, requireRole } from "../middleware/auth";
import { canManageClient } from "../services/clientAccessService";
import { createCoachPresenceForEvent } from "../services/coachPresenceService";
import { resolveNutritionTargets } from "../services/nutritionTargetService";
import {
  BodyCompositionScan,
  BodyCompositionScanInput,
  bodyCompositionScanFromDb,
  buildBodyCompositionSummary,
  normalizeBodyCompositionScan,
  validateBodyCompositionScan
} from "../services/bodyCompositionService";
import { imageDataUrlSchema } from "../utils/images";
import { storageKeyBelongsToUser } from "../utils/storageOwnership";

export const bodyCompositionRouter = Router();

const scanMetricSchema = z.number().nullable().optional();
const scanSchema = z.object({
  scanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  machine: z.string().trim().max(120).nullable().optional(),
  weightKg: scanMetricSchema,
  bmi: scanMetricSchema,
  bodyFatPercent: scanMetricSchema,
  fatMassKg: scanMetricSchema,
  leanBodyMassKg: scanMetricSchema,
  estimatedLeanBodyMassKg: scanMetricSchema,
  skeletalMuscleMassKg: scanMetricSchema,
  muscleMassKg: scanMetricSchema,
  visceralFat: scanMetricSchema,
  bodyWaterPercent: scanMetricSchema,
  proteinPercent: scanMetricSchema,
  mineralPercent: scanMetricSchema,
  boneMassKg: scanMetricSchema,
  bmrKcal: z.number().int().nullable().optional(),
  metabolicAge: z.number().int().nullable().optional(),
  segmentalMuscle: z.record(z.string(), z.unknown()).nullable().optional(),
  segmentalFat: z.record(z.string(), z.unknown()).nullable().optional(),
  confidenceScore: scanMetricSchema,
  missingFields: z.array(z.string().max(80)).max(40).optional(),
  notes: z.string().max(2000).nullable().optional(),
  importSource: z.enum(["ai_import", "manual_entry"]),
  sourceImages: z.array(z.object({ key: z.string().nullable().optional(), url: z.string().nullable().optional() })).max(6).optional(),
  userConfirmed: z.boolean().default(true)
});
const extractSchema = z.object({ images: z.array(imageDataUrlSchema).min(1).max(6) });
export const bodyCompositionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

function bodyCompositionRouteLog(event: string, metadata: Record<string, unknown>) {
  if (env.BODY_COMPOSITION_AI_DEBUG_LOGS || env.NODE_ENV !== "production") {
    console.info("[body-composition-route]", event, metadata);
  }
}

function bodyCompositionRouteError(event: string, metadata: Record<string, unknown>) {
  const safeMetadata = env.NODE_ENV === "production"
    ? Object.fromEntries(Object.entries(metadata).filter(([key]) => ["durationMs", "name", "rejectedCount"].includes(key)))
    : metadata;
  console.error("[body-composition-route]", event, safeMetadata);
}

function bodyCompositionSaveLog(event: string, metadata: Record<string, unknown>) {
  if (!env.BODY_COMPOSITION_AI_DEBUG_LOGS && env.NODE_ENV === "production") return;
  console.info("[body-composition-save-route]", event, metadata);
}

async function requireEnabledAthlete(userId: string) {
  if (!env.ATHLETE_MODE_ENABLED) return false;
  const result = await query("select enabled from athlete_profiles where user_id = $1", [userId]);
  return result.rows[0]?.enabled === true;
}

export function bodyCompositionScanToDbValues(scan: BodyCompositionScanInput, userId: string, actorId: string) {
  return [
    userId,
    scan.scanDate,
    scan.machine ?? null,
    scan.weightKg ?? null,
    scan.bmi ?? null,
    scan.bodyFatPercent ?? null,
    scan.fatMassKg ?? null,
    scan.leanBodyMassKg ?? null,
    scan.estimatedLeanBodyMassKg ?? null,
    scan.skeletalMuscleMassKg ?? null,
    scan.muscleMassKg ?? null,
    scan.visceralFat ?? null,
    scan.bodyWaterPercent ?? null,
    scan.proteinPercent ?? null,
    scan.mineralPercent ?? null,
    scan.boneMassKg ?? null,
    scan.bmrKcal ?? null,
    scan.metabolicAge ?? null,
    JSON.stringify(scan.segmentalMuscle ?? {}),
    JSON.stringify(scan.segmentalFat ?? {}),
    scan.confidenceScore ?? null,
    scan.missingFields ?? [],
    scan.notes ?? null,
    scan.importSource,
    JSON.stringify(scan.sourceImages ?? []),
    scan.userConfirmed ?? true,
    scan.userConfirmed ? new Date() : null,
    actorId,
    actorId
  ];
}

async function hydrateImages(scan: BodyCompositionScan) {
  const sourceImages = await Promise.all((scan.sourceImages ?? []).map(async (image) => ({
    ...image,
    url: image.key ? await createReadUrl(image.key) : image.url ?? null
  })));
  return { ...scan, sourceImages };
}

async function getScans(userId: string, limit = 50, offset = 0) {
  const result = await query(
    "select * from body_composition_scans where user_id = $1 order by scan_date desc, created_at desc limit $2 offset $3",
    [userId, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0)]
  );
  return Promise.all(result.rows.map((row) => hydrateImages(bodyCompositionScanFromDb(row))));
}

async function getProfile(userId: string): Promise<NutritionTargetInput> {
  const result = await query<{
    goal_type: NutritionTargetInput["goalType"];
    gender: NutritionTargetInput["sex"];
    age_years: number | string | null;
    height_cm: number | string | null;
    starting_weight_kg: number | string | null;
    target_weight_kg: number | string | null;
    activity_level: NutritionTargetInput["activityLevel"];
  }>("select goal_type, gender, age_years, height_cm, starting_weight_kg, target_weight_kg, activity_level from users where id = $1", [userId]);
  const profile = result.rows[0] ?? {};
  return {
    goalType: profile.goal_type,
    sex: profile.gender,
    ageYears: profile.age_years,
    heightCm: profile.height_cm,
    weightKg: profile.starting_weight_kg,
    targetWeightKg: profile.target_weight_kg,
    activityLevel: profile.activity_level
  };
}

async function summaryFor(userId: string) {
  const [scans, profile] = await Promise.all([getScans(userId, 100), getProfile(userId)]);
  return buildBodyCompositionSummary(scans, profile);
}

async function saveScan(userId: string, actorId: string, body: unknown) {
  bodyCompositionSaveLog("save_parse_started", { userId, actorId });
  const input = normalizeBodyCompositionScan(scanSchema.parse(body));
  if ((input.sourceImages ?? []).some((image) => image.key
    && !storageKeyBelongsToUser(image.key, "body-composition", userId)
    && !storageKeyBelongsToUser(image.key, "body-composition", actorId))) {
    const error = new Error("Body Scan image is invalid.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  bodyCompositionSaveLog("save_parse_complete", {
    userId,
    scanDate: input.scanDate,
    importSource: input.importSource,
    sourceImageCount: input.sourceImages?.length ?? 0,
    segmentalMuscleKeys: Object.keys(input.segmentalMuscle ?? {}).length,
    segmentalFatKeys: Object.keys(input.segmentalFat ?? {}).length
  });
  const validation = validateBodyCompositionScan(input);
  if (!validation.valid) {
    bodyCompositionSaveLog("save_validation_failed", { userId, errors: validation.errors });
    const error = new Error(validation.errors.join(" "));
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  bodyCompositionSaveLog("save_validation_complete", { userId });
  const dbValues = bodyCompositionScanToDbValues(input, userId, actorId);
  bodyCompositionSaveLog("save_db_insert_started", {
    userId,
    sourceImagesType: typeof dbValues[24],
    sourceImagesPreview: String(dbValues[24]).slice(0, 120),
    segmentalMuscleType: typeof dbValues[18],
    segmentalMusclePreview: String(dbValues[18]).slice(0, 120)
  });
  const result = await query(
    `
    insert into body_composition_scans (
      user_id, scan_date, machine, weight_kg, bmi, body_fat_percent, fat_mass_kg,
      lean_body_mass_kg, estimated_lean_body_mass_kg, skeletal_muscle_mass_kg,
      muscle_mass_kg, visceral_fat, body_water_percent, protein_percent,
      mineral_percent, bone_mass_kg, bmr_kcal, metabolic_age, segmental_muscle,
      segmental_fat, confidence_score, missing_fields, notes, import_source,
      source_images, user_confirmed, confirmed_at, created_by_user_id, updated_by_user_id
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
    ) returning *
    `,
    dbValues
  );
  bodyCompositionSaveLog("save_db_insert_complete", {
    userId,
    scanId: result.rows[0]?.id ?? null
  });
  const hydrated = await hydrateImages(bodyCompositionScanFromDb(result.rows[0]));
  bodyCompositionSaveLog("save_hydrate_complete", {
    userId,
    scanId: hydrated.id,
    sourceImageCount: hydrated.sourceImages?.length ?? 0
  });
  return hydrated;
}

bodyCompositionRouter.post("/athlete/body-composition/extract", requireAuth, async (req, res, next) => {
  const startedAt = Date.now();
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    bodyCompositionRouteLog("request_received", {
      userId: req.user!.id,
      bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8")
    });
    const input = extractSchema.parse(req.body);
    bodyCompositionRouteLog("schema_valid", {
      imageCount: input.images.length,
      imageBytes: input.images.map((image) => Buffer.byteLength(image, "utf8"))
    });
    const draft = await extractBodyCompositionFromImages(input.images);
    bodyCompositionRouteLog("ai_extraction_complete", {
      durationMs: Date.now() - startedAt,
      confidenceScore: draft.confidenceScore,
      missingFields: draft.missingFields
    });
    const uploaded = await Promise.allSettled(input.images.map((imageDataUrl) => uploadDataUrl(`body-composition/${req.user!.id}/${randomUUID()}.jpg`, imageDataUrl)));
    const sourceImages = uploaded
      .filter((result): result is PromiseFulfilledResult<{ key: string; storageConfigured: boolean }> => result.status === "fulfilled")
      .map((result) => ({ key: result.value.key }));
    const storageFailed = uploaded.some((result) => result.status === "rejected");
    if (storageFailed) {
      bodyCompositionRouteError("storage_partial_failure", {
        rejectedCount: uploaded.filter((result) => result.status === "rejected").length
      });
    }
    res.json({
      draft: {
        ...draft,
        sourceImages,
        notes: storageFailed
          ? `${draft.notes ? `${draft.notes} ` : ""}Scan image storage did not complete, but you can still review and save the values.`
          : draft.notes
      }
    });
  } catch (error) {
    bodyCompositionRouteError("request_failed", {
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : "Unknown"
    });
    next(error);
  }
});

bodyCompositionRouter.post("/athlete/body-composition/scans", (req, _res, next) => {
  bodyCompositionSaveLog("save_ingress_before_auth", {
    path: req.originalUrl,
    method: req.method,
    hasAuthorization: Boolean(req.header("Authorization")),
    bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8")
  });
  next();
}, requireAuth, async (req, res, next) => {
  try {
    bodyCompositionSaveLog("save_handler_entered", {
      userId: req.user!.id,
      bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8"),
      scanDate: req.body?.scanDate,
      importSource: req.body?.importSource,
      hasWeight: req.body?.weightKg !== null && req.body?.weightKg !== undefined,
      hasBodyFat: req.body?.bodyFatPercent !== null && req.body?.bodyFatPercent !== undefined,
      hasSkeletalMuscle: req.body?.skeletalMuscleMassKg !== null && req.body?.skeletalMuscleMassKg !== undefined
    });
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const scan = await saveScan(req.user!.id, req.user!.id, req.body);
    void createCoachPresenceForEvent(req.user!.id, "body_scan").catch(() => undefined);
    const [summary, nutritionTargets] = await Promise.all([
      summaryFor(req.user!.id),
      resolveNutritionTargets(req.user!.id)
    ]);
    res.status(201).json({ scan, summary, nutritionTargets });
  } catch (error) {
    next(error);
  }
});

bodyCompositionRouter.get("/athlete/body-composition/scans", requireAuth, async (req, res, next) => {
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const filters = bodyCompositionHistoryQuerySchema.parse(req.query);
    res.json({ scans: await getScans(req.user!.id, filters.limit, filters.offset) });
  } catch (error) {
    next(error);
  }
});

bodyCompositionRouter.get("/athlete/body-composition/summary", requireAuth, async (req, res, next) => {
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const [summary, nutritionTargets] = await Promise.all([
      summaryFor(req.user!.id),
      resolveNutritionTargets(req.user!.id)
    ]);
    res.json({ summary, nutritionTargets });
  } catch (error) {
    next(error);
  }
});

bodyCompositionRouter.get("/trainer/clients/:clientId/body-composition", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    if (!await requireEnabledAthlete(req.params.clientId)) return res.status(404).json({ error: "Athlete Mode is not enabled for this client." });
    const filters = bodyCompositionHistoryQuerySchema.parse(req.query);
    const [summary, scans, nutritionTargets] = await Promise.all([
      summaryFor(req.params.clientId),
      getScans(req.params.clientId, filters.limit, filters.offset),
      resolveNutritionTargets(req.params.clientId)
    ]);
    res.json({ summary, scans, nutritionTargets });
  } catch (error) {
    next(error);
  }
});

bodyCompositionRouter.post("/trainer/clients/:clientId/body-composition/scans", (req, _res, next) => {
  bodyCompositionSaveLog("trainer_save_ingress_before_auth", {
    path: req.originalUrl,
    method: req.method,
    hasAuthorization: Boolean(req.header("Authorization")),
    bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8")
  });
  next();
}, requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    bodyCompositionSaveLog("trainer_save_handler_entered", {
      actorId: req.user!.id,
      clientId: req.params.clientId,
      bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8"),
      scanDate: req.body?.scanDate,
      importSource: req.body?.importSource
    });
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    if (!await requireEnabledAthlete(req.params.clientId)) return res.status(404).json({ error: "Athlete Mode is not enabled for this client." });
    const scan = await saveScan(req.params.clientId, req.user!.id, { ...req.body, importSource: "manual_entry" });
    const [summary, nutritionTargets] = await Promise.all([
      summaryFor(req.params.clientId),
      resolveNutritionTargets(req.params.clientId)
    ]);
    res.status(201).json({ scan, summary, nutritionTargets });
  } catch (error) {
    next(error);
  }
});
