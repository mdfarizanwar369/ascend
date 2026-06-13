import OpenAI from "openai";
import { FoodEstimate, LOCAL_FOODS } from "@ascend/shared";
import { env } from "../config/env";

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

function cleanJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseFoodEstimate(text: string): FoodEstimate {
  const parsed = JSON.parse(cleanJsonText(text)) as Partial<Record<keyof FoodEstimate, unknown>>;
  return {
    foodName: String(parsed.foodName ?? "Food item").trim() || "Food item",
    confidence: clampNumber(parsed.confidence, 0, 1),
    calories: clampNumber(parsed.calories, 0, 5000),
    proteinG: clampNumber(parsed.proteinG, 0, 500),
    carbsG: clampNumber(parsed.carbsG, 0, 800),
    fatG: clampNumber(parsed.fatG, 0, 500),
    notes: String(parsed.notes ?? "AI estimate. Please review and edit if needed.").trim()
  };
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
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGeminiOnce(parts: GeminiPart[], maxOutputTokens = 700) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(`${geminiBaseUrl}/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    });

    if (!response.ok) {
      throw new GeminiError(`Gemini request failed with status ${response.status}`, response.status, isRetryableGeminiStatus(response.status));
    }

    const data = (await response.json()) as GeminiResponse;
    const text = geminiText(data);
    if (!text) {
      throw new GeminiError("Gemini returned an empty response.", undefined, true);
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
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callGeminiOnce(parts, maxOutputTokens);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof GeminiError ? error.retryable : false;
      if (!retryable || attempt === 2) break;
      await sleep(650 * (attempt + 1));
    }
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
  const text = await callGemini([
    {
      text:
        "You are estimating food for a fitness accountability app. Identify the visible food and portion size from this photo, then estimate calories and macros. Prioritize Malaysia and Singapore foods when they match the image, such as " +
        LOCAL_FOODS.join(", ") +
        ". If the food is not local, identify it normally, for example croissant, eggs, oats, sandwich, pasta, coffee, fruit, or dessert. Do not guess a local food unless it visually matches. Return only strict JSON with these exact keys: foodName, confidence, calories, proteinG, carbsG, fatG, notes. Use confidence from 0 to 1. If unsure, use a lower confidence and explain what needs review in notes. The user can edit the estimate."
    },
    imagePart
  ], 1000);

  return parseFoodEstimate(text);
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

export async function estimateFoodFromImage(imageUrl: string): Promise<FoodEstimate> {
  if (!providerConfigured()) return demoFoodEstimate();
  if (env.AI_PROVIDER === "gemini") return estimateFoodWithGemini(imageUrl);
  if (env.AI_PROVIDER === "openai") return estimateFoodWithOpenAI(imageUrl);

  return {
    ...demoFoodEstimate(),
    notes: "Starter estimate. Live AI image analysis is temporarily unavailable."
  };
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
  return createTextReply(
    "You are Ascend's nutrition coach. Be practical, warm, beginner-friendly, and culturally aware for Malaysia and Singapore. Do not diagnose medical conditions. Reply in complete sentences, around 80-140 words. If using bullets, use at most 3. End with one clear next action.",
    `Client context: ${context}\n\nQuestion: ${message}`,
    "I can help you make the next meal a little easier. Aim for protein first, add vegetables, and keep portions consistent."
  );
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
