import OpenAI from "openai";
import { FoodEstimate, LOCAL_FOODS } from "@ascend/shared";
import { env } from "../config/env";

const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function estimateFoodFromImage(imageUrl: string): Promise<FoodEstimate> {
  if (!client) {
    return {
      foodName: "Nasi Lemak",
      confidence: 0.72,
      calories: 620,
      proteinG: 18,
      carbsG: 72,
      fatG: 28,
      notes: "Demo estimate. Configure OPENAI_API_KEY to enable live image analysis."
    };
  }

  const response = await client.responses.create({
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
              '. Return strict JSON with foodName, confidence, calories, proteinG, carbsG, fatG, notes. The user can edit the estimate.'
          },
          { type: "input_image", image_url: imageUrl, detail: "auto" }
        ]
      }
    ]
  });

  const text = response.output_text;
  return JSON.parse(text) as FoodEstimate;
}

export async function createNutritionCoachReply(message: string, context: string) {
  if (!client) {
    return "I can help you make the next meal a little easier. Aim for protein first, add vegetables, and keep portions consistent.";
  }

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are Ascend's nutrition coach. Be practical, beginner-friendly, and culturally aware for Malaysia and Singapore. Do not diagnose medical conditions."
      },
      { role: "user", content: `Client context: ${context}\n\nQuestion: ${message}` }
    ]
  });

  return response.output_text;
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
  if (!client) return fallbackBurnEstimate(text);

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "Estimate exercise calories for a beginner fitness app. Return strict JSON with activityType, durationMinutes, caloriesBurned, notes. Be practical, not medical."
      },
      { role: "user", content: text }
    ]
  });

  try {
    return JSON.parse(response.output_text) as ReturnType<typeof fallbackBurnEstimate>;
  } catch {
    return fallbackBurnEstimate(text);
  }
}

export async function createWeeklySummary(context: string) {
  if (!client) {
    return "This week shows steady effort. Keep food logs consistent, hit water targets, and focus on one repeatable habit.";
  }

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "Create a concise trainer-facing weekly check-in summary. Mention wins, risks, and next actions. Avoid medical diagnosis."
      },
      { role: "user", content: context }
    ]
  });

  return response.output_text;
}
