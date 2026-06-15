import { Router } from "express";
import { createNutritionCoachReply, estimateBurnFromText } from "../integrations/openai";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { query } from "../db/pool";
import { logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";

export const aiRouter = Router();

aiRouter.post("/ai/chat", requireAuth, requireActivePlan("premium"), async (req, res) => {
  const message = String(req.body.message ?? "");
  const [contextResult, recentFoodResult, recentMessagesResult] = await Promise.all([
    query("select goal_type, starting_weight_kg, target_weight_kg from users where id = $1", [req.user!.id]),
    query(
      `
      select estimated_food_name, calories, protein_g, carbs_g, fat_g, meal_type, logged_at
      from food_logs
      where user_id = $1
      order by logged_at desc
      limit 5
      `,
      [req.user!.id]
    ),
    query(
      `
      select role, message
      from ai_chat_messages
      where user_id = $1
      order by created_at desc
      limit 8
      `,
      [req.user!.id]
    )
  ]);
  const promptContext = JSON.stringify({
    profile: contextResult.rows[0] ?? {},
    recentFoodLogs: recentFoodResult.rows,
    recentConversation: recentMessagesResult.rows.reverse()
  });
  const reply = await createNutritionCoachReply(message, promptContext);
  await logAiUsage({
    userId: req.user!.id,
    gymId: req.user!.gymId,
    eventType: "ai_chat_message",
    provider: env.AI_PROVIDER,
    model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
    status: "success",
    inputUnits: message.length + promptContext.length,
    outputUnits: reply.length
  });

  await query("insert into ai_chat_messages (user_id, role, message) values ($1, 'user', $2), ($1, 'assistant', $3)", [
    req.user!.id,
    message,
    reply
  ]);

  res.json({ reply });
});

aiRouter.post("/ai/burn-estimate", requireAuth, requireActivePlan("premium"), async (req, res) => {
  const text = String(req.body.text ?? "");
  const estimate = await estimateBurnFromText(text);
  res.json({ estimate });
});
