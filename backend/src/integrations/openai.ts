import OpenAI from "openai";
import { FoodEstimate, LOCAL_FOODS } from "@ascend/shared";
import { env } from "../config/env";
import { assertFoodAiAllowance, getCachedFoodEstimate, imageHashFromDataUrl, logAiUsage, saveFoodEstimateCache } from "../services/aiUsageService";
import { normalizeWithLocalFoodDatabase } from "../services/localFoodService";

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

  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      try {
        return await callGeminiOnce(model, parts, maxOutputTokens, options);
      } catch (error) {
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

async function estimateFoodWithGemini(imageUrl: string) {
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
      responseMimeType
    });
    return parseFoodEstimate(text);
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
  context: { userId?: string | null; gymId?: string | null } = {}
): Promise<FoodEstimate> {
  const imageHash = imageUrl.startsWith("data:image/") ? imageHashFromDataUrl(imageUrl) : null;
  if (imageHash) {
    const cached = await getCachedFoodEstimate(imageHash);
    if (cached) {
      await logAiUsage({
        ...context,
        eventType: "food_image_analysis",
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        status: "cache_hit",
        cacheHit: true,
        metadata: { imageHash }
      });
      return cached;
    }
  }

  if (!providerConfigured()) {
    await logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "fallback",
      metadata: { reason: "provider_not_configured", imageHash }
    });
    return demoFoodEstimate();
  }

  if (context.userId) {
    await assertFoodAiAllowance(context.userId);
  }

  try {
    const rawEstimate =
      env.AI_PROVIDER === "gemini"
        ? await estimateFoodWithGemini(imageUrl)
        : env.AI_PROVIDER === "openai"
          ? await estimateFoodWithOpenAI(imageUrl)
          : {
              ...demoFoodEstimate(),
              notes: "Starter estimate. Live AI image analysis is temporarily unavailable."
            };
    const estimate = await normalizeWithLocalFoodDatabase(rawEstimate);

    if (imageHash && estimate.confidence >= 0.5 && estimate.calories > 0) {
      await saveFoodEstimateCache({
        imageHash,
        estimate,
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        source: estimate.notes.includes("local food database") ? "local_food_match" : "ai"
      });
    }

    await logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      metadata: { imageHash, confidence: estimate.confidence, foodName: estimate.foodName }
    });

    return estimate;
  } catch (error) {
    const fallbackEstimate = starterFoodEstimate(
      error instanceof Error && /quota|billing|RESOURCE_EXHAUSTED|429/i.test(error.message)
        ? "Gemini quota or billing appears unavailable right now."
        : "The AI scan did not complete reliably."
    );

    await logAiUsage({
      ...context,
      eventType: "food_image_analysis",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "fallback",
      metadata: { imageHash, error: error instanceof Error ? error.message : "unknown_error" }
    });
    return fallbackEstimate;
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
