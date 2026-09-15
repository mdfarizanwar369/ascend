import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getAiConsent, saveAiConsent } from "../services/aiConsentService";

export const aiConsentRouter = Router();
const choiceSchema = z.object({ provider: z.enum(["gemini", "openai"]), version: z.string().max(50), allowed: z.boolean() }).strict();

aiConsentRouter.get("/me/ai-consent", requireAuth, async (req, res, next) => {
  try { res.json({ consent: await getAiConsent(req.user!.id) }); } catch (error) { next(error); }
});
aiConsentRouter.put("/me/ai-consent", requireAuth, async (req, res, next) => {
  try { res.json({ consent: await saveAiConsent(req.user!.id, choiceSchema.parse(req.body)) }); } catch (error) { next(error); }
});
