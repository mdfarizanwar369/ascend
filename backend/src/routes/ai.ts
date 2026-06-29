import { Router } from "express";
import { createNutritionCoachReply, estimateBurnFromText } from "../integrations/openai";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { query } from "../db/pool";
import { logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";
import { aiRateLimit } from "../middleware/rateLimits";
import { z } from "zod";
import { getHealthSyncSummary } from "../services/healthSyncService";

export const aiRouter = Router();

aiRouter.post("/ai/chat", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const message = z.string().trim().min(1).max(2_000).parse(req.body.message);
    const [contextResult, recentFoodResult, recentMessagesResult, healthSyncSummary] = await Promise.all([
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
      ),
      getHealthSyncSummary(req.user!.id)
    ]);
    const promptContext = JSON.stringify({
      profile: contextResult.rows[0] ?? {},
      recentFoodLogs: recentFoodResult.rows,
      recentConversation: recentMessagesResult.rows.reverse(),
      healthSync: healthSyncSummary
        ? {
            todaySteps: healthSyncSummary.todaySteps,
            averageSteps7d: healthSyncSummary.averageSteps7d,
            todayActiveCalories: healthSyncSummary.todayActiveCalories,
            workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
            workoutCompletedToday: healthSyncSummary.workoutCompletedToday,
            lastSyncedAt: healthSyncSummary.lastSyncedAt
          }
        : null
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
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/ai/burn-estimate", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const text = z.string().trim().min(2).max(500).parse(req.body.text);
    const estimate = await estimateBurnFromText(text);
    res.json({ estimate });
  } catch (error) {
    next(error);
  }
});
