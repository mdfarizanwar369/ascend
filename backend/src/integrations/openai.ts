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
