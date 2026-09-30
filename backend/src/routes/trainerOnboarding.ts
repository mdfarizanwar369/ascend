import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getAdminGymScope, scopeAllowsGym } from "../services/adminScopeService";
import { createTrainerReferralCode, findTrainerInvitation, getTrainerOnboardingStatus, saveTrainerOnboardingIntent } from "../services/trainerOnboardingService";
import { connectClientToTrainer, disconnectClientFromTrainer, previewTrainerConnection } from "../services/clientTrainerConnectionService";

export const trainerOnboardingRouter = Router();
const trainerOnboardingRateLimit = rateLimit({ windowMs: 60_000, limit: 20 });

const intentSchema = z.object({
  mode: z.enum(["independent", "gym"]),
  workspaceName: z.string().trim().min(2).max(80).optional(),
  country: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
  invitationCode: z.string().trim().min(6).max(64).optional()
});

trainerOnboardingRouter.get("/trainer-onboarding/status", requireAuth, async (req, res, next) => {
  try { res.json({ onboarding: await getTrainerOnboardingStatus(req.user!.id) }); }
  catch (error) { next(error); }
});

trainerOnboardingRouter.post("/trainer-onboarding/intent", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = intentSchema.parse(req.body);
    res.status(201).json({ onboarding: await saveTrainerOnboardingIntent(req.user!.id, req.user!.email, input) });
  } catch (error) { next(error); }
});

trainerOnboardingRouter.post("/trainer-onboarding/gym-invitation/validate", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(6).max(64) }).parse(req.body);
    const invitation = await findTrainerInvitation(input.code, req.user!.email);
    if (!invitation) return res.status(404).json({ error: "Trainer invitation not found, expired, or already used." });
    res.json({ invitation: { gymName: invitation.gym_name, expiresAt: invitation.expires_at } });
  } catch (error) { next(error); }
});

trainerOnboardingRouter.post("/trainer/referral-code", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try { res.status(201).json({ referral: await createTrainerReferralCode(req.user!.id) }); }
  catch (error) { next(error); }
});

trainerOnboardingRouter.patch("/trainer/referral-code", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(4).max(20) }).parse(req.body);
    res.json({ referral: await createTrainerReferralCode(req.user!.id, input.code) });
  } catch (error) { next(error); }
});

trainerOnboardingRouter.post("/me/trainer-connection/preview", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(4).max(64) }).parse(req.body);
    const connection = await previewTrainerConnection(input.code);
    if (!connection) return res.status(404).json({ error: "Trainer referral code not found." });
    res.json({ connection });
  } catch (error) { next(error); }
});

trainerOnboardingRouter.post("/me/trainer-connection/confirm", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(4).max(64), consentVersion: z.string().min(1).max(80) }).parse(req.body);
    res.json({ connection: await connectClientToTrainer(req.user!.id, input.code, input.consentVersion) });
  } catch (error) { next(error); }
});

trainerOnboardingRouter.delete("/me/trainer-connection", requireAuth, trainerOnboardingRateLimit, async (req, res, next) => {
  try { res.json({ disconnected: await disconnectClientFromTrainer(req.user!.id) }); }
  catch (error) { next(error); }
});

trainerOnboardingRouter.post("/admin/trainer-invitations", requireAuth, requireRole(["admin", "owner"]), trainerOnboardingRateLimit, async (req, res, next) => {
  try {
    const input = z.object({
      gymId: z.string().uuid(),
      intendedEmail: z.string().trim().email().optional(),
      expiresInDays: z.number().int().min(1).max(30).default(7)
    }).parse(req.body);
    const scope = await getAdminGymScope(req.user!);
    if (!scopeAllowsGym(scope, input.gymId)) return res.status(403).json({ error: "This account cannot invite trainers to that gym." });
    const code = `TRAINER-${randomBytes(5).toString("hex").toUpperCase()}`;
    const result = await query(`
      insert into trainer_invitations (code, gym_id, intended_email, created_by_user_id, expires_at)
      values ($1,$2,$3,$4,now() + ($5::text || ' days')::interval)
      returning id, code, intended_email, expires_at
    `, [code, input.gymId, input.intendedEmail?.toLowerCase() ?? null, req.user!.id, input.expiresInDays]);
    res.status(201).json({ invitation: result.rows[0] });
  } catch (error) { next(error); }
});
