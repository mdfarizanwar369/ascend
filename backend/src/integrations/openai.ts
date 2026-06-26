import OpenAI from "openai";
import { FoodEstimate, LOCAL_FOODS } from "@ascend/shared";
import { env } from "../config/env";
import { assertFoodAiAllowance, getCachedFoodEstimate, imageHashFromDataUrl, logAiUsage, saveFoodEstimateCache } from "../services/aiUsageService";
import { normalizeWithLocalFoodDatabase } from "../services/localFoodService";
import { buildBodyCompositionAiPrompt, mergeBodyCompositionDrafts, normalizeBodyCompositionScan } from "../services/bodyCompositionService";
import {
  annotateLatestGeminiParse,
  FoodAiPerformanceTrace,
  recordGeminiAttempt,
  timeFoodAiStage,
  timeFoodAiSyncStage
} from "../services/foodAiPerformance";

const openaiClient = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
const geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};
type GeminiCallOptions = {
  models?: string[];
  attemptsPerModel?: number;
  timeoutMs?: number;
  responseMimeType?: "application/json" | "text/plain";
  performanceTrace?: FoodAiPerformanceTrace | null;
};

class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message);
  }
}

class BodyCompositionExtractionError extends Error {
  constructor(
    message: string,
    public readonly category: "configuration" | "request" | "gemini" | "timeout" | "empty_response" | "invalid_json" | "unknown",
    public readonly technicalDetail?: string,
    public readonly rawResponse?: string
  ) {
    super(message);
    this.name = "BodyCompositionExtractionError";
  }
}

function bodyCompositionDebugLog(event: string, metadata: Record<string, unknown>) {
  const shouldLog = env.BODY_COMPOSITION_AI_DEBUG_LOGS || env.NODE_ENV !== "production";
  if (!shouldLog) return;
  console.info("[body-composition-ai]", event, metadata);
}

function bodyCompositionErrorLog(event: string, metadata: Record<string, unknown>) {
  console.error("[body-composition-ai]", event, metadata);
}

function demoFoodEstimate(): FoodEstimate {
  return {
    foodName: "Manual food entry",
    confidence: 0,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    notes: "Live AI image analysis is temporarily unavailable. Please enter the food and macros manually before saving."
  };
}

function starterFoodEstimate(reason: string): FoodEstimate {
  return {
    foodName: "Mixed meal or snack plate",
    confidence: 0.25,
    calories: 450,
    proteinG: 18,
    carbsG: 35,
    fatG: 25,
    notes: `AI had trouble reading this photo clearly, so Ascend filled a conservative starter estimate. Please edit the food name, portion, and macros before saving. ${reason}`
  };
}

function cleanJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }
  return cleaned;
}

function firstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function parseFoodEstimate(text: string): FoodEstimate {
  const json = JSON.parse(cleanJsonText(text)) as unknown;
  const parsed =
    Array.isArray(json) && json[0] && typeof json[0] === "object"
      ? (json[0] as Record<string, unknown>)
      : json && typeof json === "object"
        ? (json as Record<string, unknown>)
        : {};

  return {
    foodName: String(firstValue(parsed, ["foodName", "food_name", "name", "dishName"]) ?? "Food item").trim() || "Food item",
    confidence: confidenceNumber(firstValue(parsed, ["confidence", "confidenceScore", "confidence_score"])),
    calories: clampNumber(firstValue(parsed, ["calories", "kcal", "calorieEstimate"]), 0, 5000),
    proteinG: clampNumber(firstValue(parsed, ["proteinG", "protein_g", "protein", "proteinGrams"]), 0, 500),
    carbsG: clampNumber(firstValue(parsed, ["carbsG", "carbs_g", "carbs", "carbohydrates", "carbohydrateG"]), 0, 800),
    fatG: clampNumber(firstValue(parsed, ["fatG", "fat_g", "fat", "fats", "fatGrams"]), 0, 500),
    notes: String(firstValue(parsed, ["notes", "note", "explanation"]) ?? "AI estimate. Please review and edit if needed.").trim()
  };
}

function nullishNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const poundsToKg = 0.45359237;

function roundBodyMetric(value: number | null, decimals = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function numberFromParsed(source: Record<string, unknown>, keys: string[]) {
  return nullishNumber(firstValue(source, keys));
}

function kgFromParsed(source: Record<string, unknown>, kgKeys: string[], lbKeys: string[]) {
  const explicitLb = numberFromParsed(source, lbKeys);
  if (explicitLb !== null) return roundBodyMetric(explicitLb * poundsToKg);
  return numberFromParsed(source, kgKeys);
}

function bodyCompositionConfidence(value: unknown) {
  const number = nullishNumber(value);
  if (number === null) return null;
  if (number > 1 && number <= 10) return roundBodyMetric(number / 10, 2);
  if (number > 10 && number <= 100) return roundBodyMetric(number / 100, 2);
  return clampNumber(number, 0, 1);
}

function bodyCompositionScanDate(value: unknown) {
  if (typeof value !== "string" || value.toLowerCase() === "null" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date().toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function sanitizeSegmentalValues(segmental: unknown) {
  if (!segmental || typeof segmental !== "object") return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(segmental as Record<string, unknown>)) {
    const number = nullishNumber(value);
    if (number === null) {
      output[key] = value;
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey.endsWith("kg")) {
      const plausibleKgMax = lowerKey.includes("arm") ? 20 : lowerKey.includes("leg") ? 45 : lowerKey.includes("trunk") ? 80 : 80;
      const likelyPercentThreshold = lowerKey.includes("trunk") ? 90 : lowerKey.includes("leg") ? 70 : 30;
      if (number >= likelyPercentThreshold && number <= 300) {
        output[key.replace(/Kg$/i, "Percent")] = number;
        continue;
      }
      output[key] = number > plausibleKgMax ? roundBodyMetric(number * poundsToKg) : number;
      continue;
    }
    output[key] = number;
  }
  return output;
}

function sanitizeBodyCompositionUnitMix(input: ReturnType<typeof normalizeBodyCompositionScan>) {
  const output = { ...input };
  const impliedWeightFromFat = output.fatMassKg && output.bodyFatPercent ? output.fatMassKg / (output.bodyFatPercent / 100) : null;
  const weightForBmi = output.weightKg ?? impliedWeightFromFat;
  const impliedHeightM = weightForBmi && output.bmi ? Math.sqrt(weightForBmi / output.bmi) : null;
  const likelyPoundReport = Boolean(weightForBmi && output.bmi && impliedHeightM && impliedHeightM > 2.25 && weightForBmi > 180);

  if (likelyPoundReport) {
    output.weightKg = output.weightKg ? roundBodyMetric(output.weightKg * poundsToKg) : roundBodyMetric((impliedWeightFromFat ?? 0) * poundsToKg);
    output.fatMassKg = output.fatMassKg ? roundBodyMetric(output.fatMassKg * poundsToKg) : null;
    output.leanBodyMassKg = output.leanBodyMassKg ? roundBodyMetric(output.leanBodyMassKg * poundsToKg) : null;
    output.estimatedLeanBodyMassKg = output.estimatedLeanBodyMassKg ? roundBodyMetric(output.estimatedLeanBodyMassKg * poundsToKg) : null;
    output.skeletalMuscleMassKg = output.skeletalMuscleMassKg ? roundBodyMetric(output.skeletalMuscleMassKg * poundsToKg) : null;
    output.muscleMassKg = output.muscleMassKg ? roundBodyMetric(output.muscleMassKg * poundsToKg) : null;
    output.boneMassKg = output.boneMassKg ? roundBodyMetric(output.boneMassKg * poundsToKg) : null;
    output.notes = `${output.notes ? `${output.notes} ` : ""}Ascend detected an lb-based report and converted body composition weights to kg.`;
  }

  output.segmentalMuscle = sanitizeSegmentalValues(output.segmentalMuscle);
  output.segmentalFat = sanitizeSegmentalValues(output.segmentalFat);
  return normalizeBodyCompositionScan(output);
}

function parseBodyCompositionExtraction(text: string) {
  const cleaned = cleanJsonText(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (error) {
    bodyCompositionErrorLog("invalid_json", {
      message: error instanceof Error ? error.message : "Unknown JSON parse error",
      responsePreview: text.slice(0, 500),
      rawResponse: env.NODE_ENV === "production" ? undefined : text
    });
    throw new BodyCompositionExtractionError(
      "Gemini returned invalid JSON for this body composition scan.",
      "invalid_json",
      error instanceof Error ? error.message : "Unknown JSON parse error",
      env.NODE_ENV === "production" ? undefined : text
    );
  }
  return sanitizeBodyCompositionUnitMix(normalizeBodyCompositionScan({
    scanDate: bodyCompositionScanDate(parsed.scanDate),
    machine: typeof parsed.machine === "string" ? parsed.machine : null,
    weightKg: kgFromParsed(parsed, ["weightKg", "weight_kg"], ["weightLb", "weight_lb", "weightLbs"]),
    bmi: nullishNumber(parsed.bmi),
    bodyFatPercent: nullishNumber(parsed.bodyFatPercent),
    fatMassKg: kgFromParsed(parsed, ["fatMassKg", "fat_mass_kg"], ["fatMassLb", "fat_mass_lb", "bodyFatMassLb"]),
    leanBodyMassKg: kgFromParsed(parsed, ["leanBodyMassKg", "lean_body_mass_kg"], ["leanBodyMassLb", "lean_body_mass_lb"]),
    estimatedLeanBodyMassKg: kgFromParsed(parsed, ["estimatedLeanBodyMassKg", "estimated_lean_body_mass_kg"], ["estimatedLeanBodyMassLb"]),
    skeletalMuscleMassKg: kgFromParsed(parsed, ["skeletalMuscleMassKg", "skeletal_muscle_mass_kg", "smmKg"], ["skeletalMuscleMassLb", "skeletal_muscle_mass_lb", "smmLb"]),
    muscleMassKg: kgFromParsed(parsed, ["muscleMassKg", "muscle_mass_kg"], ["muscleMassLb", "muscle_mass_lb"]),
    visceralFat: nullishNumber(parsed.visceralFat),
    bodyWaterPercent: nullishNumber(parsed.bodyWaterPercent),
    proteinPercent: nullishNumber(parsed.proteinPercent),
    mineralPercent: nullishNumber(parsed.mineralPercent),
    boneMassKg: kgFromParsed(parsed, ["boneMassKg", "bone_mass_kg"], ["boneMassLb", "bone_mass_lb"]),
    bmrKcal: nullishNumber(parsed.bmrKcal),
    metabolicAge: nullishNumber(parsed.metabolicAge),
    segmentalMuscle: parsed.segmentalMuscle && typeof parsed.segmentalMuscle === "object" ? parsed.segmentalMuscle as Record<string, unknown> : {},
    segmentalFat: parsed.segmentalFat && typeof parsed.segmentalFat === "object" ? parsed.segmentalFat as Record<string, unknown> : {},
    confidenceScore: bodyCompositionConfidence(parsed.confidenceScore),
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map(String).slice(0, 30) : [],
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 2000) : null,
    importSource: "ai_import",
    userConfirmed: false
  }));
}

function bodyCompositionFallbackDraft(reason: string) {
  return normalizeBodyCompositionScan({
    scanDate: new Date().toISOString().slice(0, 10),
    machine: null,
    confidenceScore: 0,
    missingFields: [
      "weightKg",
      "bmi",
      "bodyFatPercent",
      "fatMassKg",
      "leanBodyMassKg",
      "skeletalMuscleMassKg",
      "visceralFat",
      "bodyWaterPercent",
      "bmrKcal"
    ],
    notes: `AI could not read this body composition scan reliably. Please enter or confirm the visible values manually. ${reason}`.slice(0, 2000),
    importSource: "ai_import",
    userConfirmed: false
  });
}

function classifyBodyCompositionError(error: unknown): BodyCompositionExtractionError {
  if (error instanceof BodyCompositionExtractionError) return error;
  if (error instanceof GeminiError) {
    const category = error.message.includes("timed out")
      ? "timeout"
      : error.message.includes("empty response")
        ? "empty_response"
        : "gemini";
    return new BodyCompositionExtractionError(
      category === "timeout"
        ? "Gemini timed out while reading this body composition scan."
        : category === "empty_response"
          ? "Gemini returned an empty response for this scan."
          : "Gemini could not process this body composition scan.",
      category,
      error.message
    );
  }
  if (error instanceof SyntaxError) {
    return new BodyCompositionExtractionError("Gemini returned invalid JSON for this body composition scan.", "invalid_json", error.message);
  }
  if (error instanceof Error) {
    return new BodyCompositionExtractionError("Body composition AI extraction failed.", "unknown", error.message);
  }
  return new BodyCompositionExtractionError("Body composition AI extraction failed.", "unknown", "Unknown error");
}

function confidenceNumber(value: unknown) {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("high")) return 0.9;
    if (lower.includes("medium") || lower.includes("moderate")) return 0.65;
    if (lower.includes("low")) return 0.35;
  }
  return clampNumber(value, 0, 1);
}

function providerConfigured() {
  if (env.AI_PROVIDER === "gemini") return Boolean(env.GEMINI_API_KEY);
  if (env.AI_PROVIDER === "openai") return Boolean(openaiClient);
  return false;
}

function geminiText(response: GeminiResponse) {
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiStatus(status: number) {
  return status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function geminiFailureReason(error: unknown) {
  if (error instanceof GeminiError) {
    if (error.message.includes("timed out")) return "Timeout";
    if (error.message.includes("empty response")) return "Empty response";
    if (error.status === 429) return "Quota or rate limit";
    if (error.status && error.status >= 500) return "Gemini service error";
    if (error.status && error.status >= 400) return "Gemini request rejected";
    return error.message;
  }

  if (error instanceof SyntaxError) return "JSON parse error";
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

async function callGeminiOnce(model: string, parts: GeminiPart[], maxOutputTokens = 700, options: GeminiCallOptions = {}) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const generationConfig: Record<string, unknown> = {
    temperature: 0.25,
    maxOutputTokens
  };

  if (model.includes("2.5")) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType;
  }

  try {
    const response = await fetch(`${geminiBaseUrl}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new GeminiError(
        `Gemini ${model} request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 180)}` : ""}`,
        response.status,
        isRetryableGeminiStatus(response.status)
      );
    }

    const data = (await response.json()) as GeminiResponse;
    const text = geminiText(data);
    if (!text) {
      throw new GeminiError(`Gemini ${model} returned an empty response.`, undefined, true);
    }

    return text;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiError("Gemini request timed out.", undefined, true);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(parts: GeminiPart[], maxOutputTokens = 700) {
  return callGeminiWithOptions(parts, maxOutputTokens);
}

async function callGeminiWithOptions(parts: GeminiPart[], maxOutputTokens = 700, options: GeminiCallOptions = {}) {
  let lastError: unknown;
  const errors: string[] = [];
  const models = uniqueModels(options.models ?? [env.GEMINI_MODEL]);
  const attemptsPerModel = options.attemptsPerModel ?? 1;
  const responseMode = options.responseMimeType === "application/json" ? "JSON" : "Flexible";

  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      const startedAtEpochMs = Date.now();
      const attemptNumber = (options.performanceTrace?.geminiAttempts.length ?? 0) + 1;
      try {
        const text = await callGeminiOnce(model, parts, maxOutputTokens, options);
        const endedAtEpochMs = Date.now();
        recordGeminiAttempt(options.performanceTrace, {
          attempt: attemptNumber,
          model,
          responseMode,
          startedAtEpochMs,
          endedAtEpochMs,
          success: true
        });
        return text;
      } catch (error) {
        const endedAtEpochMs = Date.now();
        recordGeminiAttempt(options.performanceTrace, {
          attempt: attemptNumber,
          model,
          responseMode,
          startedAtEpochMs,
          endedAtEpochMs,
          success: false,
          failureReason: geminiFailureReason(error),
          status: error instanceof GeminiError ? error.status : undefined,
          timeout: error instanceof GeminiError && error.message.includes("timed out")
        });
        lastError = error;
        if (error instanceof Error) errors.push(error.message);
        const retryable = error instanceof GeminiError ? error.retryable : false;
        if (!retryable || attempt === attemptsPerModel - 1) break;
        await sleep(700 * (attempt + 1));
      }
    }
  }

  if (errors.length) {
    if (errors.some((message) => /quota|RESOURCE_EXHAUSTED|429/i.test(message))) {
      throw new Error("Gemini quota or credits are exhausted. Add Gemini billing credits or use another AI provider for reliable AI responses.");
    }
    throw new Error(`All Gemini models failed: ${errors.join(" | ")}`);
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

function dataUrlToGeminiPart(imageUrl: string): GeminiPart | null {
  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2]
    }
  };
}

async function urlToGeminiPart(imageUrl: string): Promise<GeminiPart> {
  const dataUrlPart = dataUrlToGeminiPart(imageUrl);
  if (dataUrlPart) return dataUrlPart;

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Could not fetch image for Gemini analysis.");
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    inlineData: {
      mimeType: contentType,
      data: buffer.toString("base64")
    }
  };
}

async function estimateFoodWithGemini(imageUrl: string, performanceTrace?: FoodAiPerformanceTrace | null) {
  const imagePart = await urlToGeminiPart(imageUrl);
  const parts: GeminiPart[] = [
    imagePart,
    {
      text:
        "You are estimating food for a fitness accountability app. Identify the visible food and portion size from this photo, then estimate calories and macros. Prioritize Malaysia and Singapore foods when they match the image, such as " +
        LOCAL_FOODS.join(", ") +
        ". If the food is not local, identify it normally, for example croissant, eggs, oats, sandwich, pasta, coffee, fruit, dessert, chicken nuggets, sausage, hot dog, fries, burger, or mixed snack plate. Do not guess a local food unless it visually matches. If there are multiple visible foods, name the main items together, estimate the full visible portion, and mention portion assumptions in notes. Always return your best editable starter estimate for recognizable food; use lower confidence when unsure instead of refusing. Return only strict JSON with these exact keys: foodName, confidence, calories, proteinG, carbsG, fatG, notes. Use confidence from 0 to 1. The user can edit the estimate."
    }
  ];
  const strongerModels = uniqueModels([env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.0-flash"]);

  async function generateEstimate(models: string[], responseMimeType?: "application/json") {
    const text = await callGeminiWithOptions(parts, 1400, {
      models,
      attemptsPerModel: 1,
      timeoutMs: 22_000,
      responseMimeType,
      performanceTrace
    });
    try {
      const estimate = timeFoodAiSyncStage(performanceTrace, "Gemini response parse", () => parseFoodEstimate(text), {
        responseMode: responseMimeType === "application/json" ? "JSON" : "Flexible"
      });
      annotateLatestGeminiParse(performanceTrace, { success: true });
      return estimate;
    } catch (error) {
      annotateLatestGeminiParse(performanceTrace, { success: false, failureReason: geminiFailureReason(error) });
      throw error;
    }
  }

  try {
    return await generateEstimate([env.GEMINI_MODEL], "application/json");
  } catch {}

  try {
    const estimate = await generateEstimate([env.GEMINI_MODEL]);
    return {
      ...estimate,
      notes: `${estimate.notes} Ascend retried the scan with a more flexible response format.`
    };
  } catch {}

  try {
    const estimate = await generateEstimate(strongerModels, "application/json");
    return {
      ...estimate,
      notes: `${estimate.notes} Ascend used a stronger backup AI model because the first scan was unclear.`
    };
  } catch {
    const estimate = await generateEstimate(strongerModels);
    return {
      ...estimate,
      notes: `${estimate.notes} Ascend used a stronger backup AI model with a flexible response format.`
    };
  }
}

async function estimateFoodWithOpenAI(imageUrl: string) {
  if (!openaiClient) return demoFoodEstimate();

  const response = await openaiClient.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Estimate calories and macros from this food photo. Prioritize Malaysia and Singapore foods such as " +
              LOCAL_FOODS.join(", ") +
              ". Return strict JSON with foodName, confidence, calories, proteinG, carbsG, fatG, notes. The user can edit the estimate."
          },
          { type: "input_image", image_url: imageUrl, detail: "auto" }
        ]
      }
    ]
  });

  return parseFoodEstimate(response.output_text);
}

export async function estimateFoodFromImage(
  imageUrl: string,
  context: { userId?: string | null; gymId?: string | null; performanceTrace?: FoodAiPerformanceTrace | null } = {}
): Promise<FoodEstimate> {
  const imageHash = timeFoodAiSyncStage(context.performanceTrace, "Image hash calculation", () =>
    imageUrl.startsWith("data:image/") ? imageHashFromDataUrl(imageUrl) : null
  );
  if (imageHash) {
    const cached = await timeFoodAiStage(context.performanceTrace, "Cache lookup", () => getCachedFoodEstimate(imageHash));
    if (cached) {
      await timeFoodAiStage(context.performanceTrace, "AI usage logging", () => logAiUsage({
        ...context,
        eventType: "food_image_analysis",
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        status: "cache_hit",
        cacheHit: true,
        metadata: { imageHash }
      }));
      return cached;
    }
  }

  if (!providerConfigured()) {
    await timeFoodAiStage(context.performanceTrace, "AI usage logging", () => logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "fallback",
      metadata: { reason: "provider_not_configured", imageHash }
    }));
    return demoFoodEstimate();
  }

  if (context.userId) {
    await timeFoodAiStage(context.performanceTrace, "Allowance lookup", () => assertFoodAiAllowance(context.userId!));
  }

  try {
    const rawEstimate =
      env.AI_PROVIDER === "gemini"
        ? await estimateFoodWithGemini(imageUrl, context.performanceTrace)
        : env.AI_PROVIDER === "openai"
          ? await estimateFoodWithOpenAI(imageUrl)
          : {
              ...demoFoodEstimate(),
              notes: "Starter estimate. Live AI image analysis is temporarily unavailable."
            };
    const estimate = await timeFoodAiStage(context.performanceTrace, "Local food normalization", () => normalizeWithLocalFoodDatabase(rawEstimate));

    if (imageHash && estimate.confidence >= 0.5 && estimate.calories > 0) {
      await timeFoodAiStage(context.performanceTrace, "Cache write", () => saveFoodEstimateCache({
        imageHash,
        estimate,
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        source: estimate.notes.includes("local food database") ? "local_food_match" : "ai"
      }));
    }

    await timeFoodAiStage(context.performanceTrace, "AI usage logging", () => logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      metadata: { imageHash, confidence: estimate.confidence, foodName: estimate.foodName }
    }));

    return estimate;
  } catch (error) {
    const fallbackEstimate = starterFoodEstimate(
      error instanceof Error && /quota|billing|RESOURCE_EXHAUSTED|429/i.test(error.message)
        ? "Gemini quota or billing appears unavailable right now."
        : "The AI scan did not complete reliably."
    );

    await timeFoodAiStage(context.performanceTrace, "AI usage logging", () => logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "fallback",
      metadata: { imageHash, error: error instanceof Error ? error.message : "unknown_error" }
    }));
    return fallbackEstimate;
  }

}

export async function extractBodyCompositionFromImages(imageDataUrls: string[]) {
  if (env.AI_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) {
    bodyCompositionErrorLog("configuration_missing", {
      aiProvider: env.AI_PROVIDER,
      hasGeminiKey: Boolean(env.GEMINI_API_KEY)
    });
    return bodyCompositionFallbackDraft("Gemini Flash Vision is not configured right now.");
  }
  if (imageDataUrls.length < 1 || imageDataUrls.length > 6) {
    throw new BodyCompositionExtractionError("Upload between 1 and 6 scan images.", "request");
  }

  const imageByteSizes = imageDataUrls.map((imageUrl) => Buffer.byteLength(imageUrl, "utf8"));
  bodyCompositionDebugLog("request_start", {
    model: env.GEMINI_MODEL,
    imageCount: imageDataUrls.length,
    imageByteSizes,
    totalRequestBytes: imageByteSizes.reduce((sum, size) => sum + size, 0)
  });

  const imageParts = imageDataUrls.map((imageUrl) => {
    const part = dataUrlToGeminiPart(imageUrl);
    if (!part) throw new BodyCompositionExtractionError("Body scan images must be JPEG, PNG, or WebP data URLs.", "request");
    return part;
  });
  const prompt = buildBodyCompositionAiPrompt();
  bodyCompositionDebugLog("gemini_request", {
    model: env.GEMINI_MODEL,
    responseMimeType: "application/json",
    temperature: 0.25,
    maxOutputTokens: 1600,
    promptChars: prompt.length,
    imageMimeTypes: imageParts.map((part) => "inlineData" in part ? part.inlineData.mimeType : "text")
  });
  try {
    const startedAt = Date.now();
    const text = await callGeminiWithOptions([
      ...imageParts,
      { text: prompt }
    ], 1600, {
      models: [env.GEMINI_MODEL],
      attemptsPerModel: 1,
      timeoutMs: 25_000,
      responseMimeType: "application/json"
    });
    bodyCompositionDebugLog("gemini_response", {
      durationMs: Date.now() - startedAt,
      responseChars: text.length,
      responsePreview: text.slice(0, 500),
      rawResponse: env.NODE_ENV === "production" ? undefined : text
    });

    return parseBodyCompositionExtraction(text);
  } catch (error) {
    const classified = classifyBodyCompositionError(error);
    bodyCompositionErrorLog("primary_attempt_failed", {
      category: classified.category,
      message: classified.message,
      technicalDetail: classified.technicalDetail
    });
    if (imageParts.length === 1) {
      return bodyCompositionFallbackDraft(classified.message);
    }
    const partials = [];
    const failedImages: number[] = [];
    for (const [index, imagePart] of imageParts.entries()) {
      try {
        const startedAt = Date.now();
        const text = await callGeminiWithOptions([imagePart, { text: prompt }], 1200, {
          models: [env.GEMINI_MODEL],
          attemptsPerModel: 1,
          timeoutMs: 18_000,
          responseMimeType: "application/json"
        });
        bodyCompositionDebugLog("single_image_response", {
          imageIndex: index,
          durationMs: Date.now() - startedAt,
          responseChars: text.length,
          responsePreview: text.slice(0, 300),
          rawResponse: env.NODE_ENV === "production" ? undefined : text
        });
        partials.push(parseBodyCompositionExtraction(text));
      } catch (partialError) {
        const partialClassified = classifyBodyCompositionError(partialError);
        failedImages.push(index + 1);
        bodyCompositionErrorLog("single_image_failed", {
          imageIndex: index,
          category: partialClassified.category,
          message: partialClassified.message,
          technicalDetail: partialClassified.technicalDetail
        });
        // The review screen still allows manual entry for fields missing from failed images.
      }
    }
    if (!partials.length) {
      return bodyCompositionFallbackDraft(classified.message);
    }
    return {
      ...mergeBodyCompositionDrafts(partials),
      notes: failedImages.length
        ? `Ascend merged values from the readable scan images. Image ${failedImages.join(", ")} could not be read reliably. Please manually confirm any missing fields.`
        : "Ascend merged values from the readable scan images. Please manually confirm any missing fields."
    };
  }
}

async function createTextReply(systemPrompt: string, userPrompt: string, fallback: string) {
  if (!providerConfigured()) return fallback;

  if (env.AI_PROVIDER === "gemini") {
    try {
      return await callGemini([{ text: `${systemPrompt}\n\n${userPrompt}` }], 1400);
    } catch {
      return fallback;
    }
  }

  if (env.AI_PROVIDER === "openai" && openaiClient) {
    const response = await openaiClient.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    return response.output_text;
  }

  return fallback;
}

export async function createNutritionCoachReply(message: string, context: string) {
  const reply = await createTextReply(
    "You are Ascend's nutrition coach for a continuous chat. Use the client context, recent food logs, and recent conversation to continue naturally. Do not restart with greetings if the conversation already exists. Be practical, warm, beginner-friendly, and culturally aware for Malaysia and Singapore. Give a complete answer that reduces unnecessary follow-up questions, but keep it mobile-friendly around 120-180 words. Prefer plain text, not Markdown. Do not use asterisks, headings, tables, or long disclaimers. If the user asks what to eat, give 2-4 specific meal options with simple portions and why they fit the goal. If they mention fast food, suggest realistic swaps or better orders. Do not diagnose medical conditions. Do not end with a question or invite more chat. End with one decisive next action as an instruction, such as: For your next meal, choose option 1 and log it after eating.",
    `Client context: ${context}\n\nQuestion: ${message}`,
    "I can help you make the next meal a little easier. Start with one palm-sized protein, add vegetables or fruit, then choose one controlled portion of rice, noodles, bread, or potatoes. If you are eating Malaysian food, a simple option is grilled chicken or eggs with vegetables and a smaller rice portion. For your next action, send or log your next meal so we can keep your day moving."
  );
  const cleaned = reply.replace(/\*\*/g, "").replace(/\*/g, "").trim();
  if (cleaned.endsWith("?")) {
    return `${cleaned.slice(0, -1).trim()}. For your next step, choose one option from above and log it after eating.`;
  }
  return cleaned;
}

function fallbackBurnEstimate(text: string) {
  const lower = text.toLowerCase();
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|km|kilometer|kilometers|k)/);
  const amount = durationMatch ? Number(durationMatch[1]) : 30;
  const unit = durationMatch?.[2] ?? "minutes";

  let activityType = "Strength training";
  let caloriesPerMinute = 6;
  if (lower.includes("run") || lower.includes("jog")) {
    activityType = "Running";
    caloriesPerMinute = 10;
  }
  if (lower.includes("walk")) {
    activityType = "Walking";
    caloriesPerMinute = 4;
  }
  if (lower.includes("cycle") || lower.includes("bike")) {
    activityType = "Cycling";
    caloriesPerMinute = 8;
  }
  if (lower.includes("class") || lower.includes("hiit") || lower.includes("zumba")) {
    activityType = "Group class";
    caloriesPerMinute = 7;
  }

  const durationMinutes = unit.startsWith("km") || unit === "k" ? Math.round(amount * (activityType === "Running" ? 6 : 12)) : Math.round(amount);
  return {
    activityType,
    durationMinutes: Math.max(durationMinutes, 1),
    caloriesBurned: Math.max(Math.round(durationMinutes * caloriesPerMinute), 1),
    notes: "Estimate based on activity type and duration. Actual burn varies by body weight and intensity."
  };
}

export async function estimateBurnFromText(text: string) {
  if (!providerConfigured()) return fallbackBurnEstimate(text);

  try {
    const reply = await createTextReply(
      "Estimate exercise calories for a beginner fitness app. Return only strict JSON with activityType, durationMinutes, caloriesBurned, notes. Be practical, not medical.",
      text,
      JSON.stringify(fallbackBurnEstimate(text))
    );
    return JSON.parse(cleanJsonText(reply)) as ReturnType<typeof fallbackBurnEstimate>;
  } catch {
    return fallbackBurnEstimate(text);
  }
}

export async function createWeeklySummary(context: string) {
  return createTextReply(
    "Create a concise trainer-facing weekly check-in summary. Mention wins, risks, and next actions. Avoid medical diagnosis.",
    context,
    "This week shows steady effort. Keep food logs consistent, hit water targets, and focus on one repeatable habit."
  );
}

export async function createClientWeeklyReport(context: string) {
  return createTextReply(
    "Create a concise client-facing weekly fitness accountability report. Be encouraging, specific, and beginner-friendly. Mention wins, one risk, and 2 next actions. Do not diagnose medical conditions.",
    context,
    "You kept the week moving. Focus next on one repeatable win: log meals earlier in the day, drink water before training, and keep your next weigh-in consistent."
  );
}
