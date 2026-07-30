import { Request, Router } from "express";
import { WORKOUT_CAPTURE_SOURCE_MODES, WORKOUT_MOVEMENT_PATTERNS } from "@ascend/shared";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { canManageClient } from "../services/clientAccessService";
import {
  cancelTrainerSession,
  completeTrainerSession,
  getClientCoachedSessions,
  getTrainerSessionOverview,
  interpretTrainerSession,
  startTrainerSession,
  updateTrainerSessionDraft
} from "../services/trainerSessionService";

export const trainerSessionsRouter = Router();

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  originalText: z.string().max(500).nullable(),
  sets: z.number().int().min(1).max(100).nullable(),
  reps: z.string().trim().max(80).nullable(),
  load: z.number().min(0).max(2_000).nullable(),
  loadUnit: z.enum(["kg", "lb"]).nullable(),
  durationMinutes: z.number().int().min(1).max(300).nullable(),
  restSeconds: z.number().int().min(0).max(3_600).nullable(),
  note: z.string().trim().max(500).nullable(),
  movementPattern: z.enum(WORKOUT_MOVEMENT_PATTERNS),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean()
});

const draftSchema = z.object({
  version: z.literal("workout_capture_v1"),
  sourceMode: z.enum(WORKOUT_CAPTURE_SOURCE_MODES),
  originalInput: z.string().max(5_000),
  title: z.string().trim().min(1).max(120),
  workoutType: z.string().trim().min(1).max(80),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  durationMinutes: z.number().int().min(5).max(300).nullable(),
  exercises: z.array(exerciseSchema).min(1).max(30),
  confidence: z.number().min(0).max(1),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(20),
  requiresReview: z.literal(true)
});

const narrativesSchema = z.object({
  clientRecap: z.string().trim().min(1).max(600),
  betweenSessionFocus: z.string().trim().min(1).max(400),
  trainerNextSessionNote: z.string().trim().min(1).max(600)
});

const trainerGuard = [requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"])] as const;

async function ensureClientAccess(req: Request, clientId: string) {
  return Boolean(req.user && await canManageClient(req.user, clientId));
}

trainerSessionsRouter.get("/trainer/clients/:clientId/coaching-sessions", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ enabled: false, deltaEnabled: false, activeSession: null, recentSessions: [], previousWorkout: null });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    res.json({ enabled: true, deltaEnabled: env.TRAINER_SESSION_DELTA_V2, ...await getTrainerSessionOverview(req.params.clientId, req.user!.id) });
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({ mode: z.enum(["repeat_last", "blank"]) }).parse(req.body);
    const session = await startTrainerSession({ clientId: req.params.clientId, actorUserId: req.user!.id, trainerId: req.user!.trainerId ?? null, gymId: req.user!.gymId ?? null, mode: body.mode });
    res.status(201).json({ session, deltaEnabled: env.TRAINER_SESSION_DELTA_V2 });
  } catch (error) { next(error); }
});

trainerSessionsRouter.patch("/trainer/clients/:clientId/coaching-sessions/:sessionId", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({ version: z.number().int().min(1), rawInput: z.string().max(5_000), durationMinutes: z.number().int().min(5).max(300).nullable().optional(), workoutDraft: draftSchema.nullable().optional() }).parse(req.body);
    const session = await updateTrainerSessionDraft({ sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, ...body });
    if (!session) return res.status(409).json({ error: "This session changed elsewhere. Refresh to continue." });
    res.json({ session });
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions/:sessionId/interpret", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({
      rawInput: z.string().trim().min(2).max(5_000),
      durationMinutes: z.number().int().min(5).max(300),
      sourceMode: z.enum(["text", "dictation"]).default("text"),
      interpretationMode: z.enum(["full", "delta"]).default("full")
    }).parse(req.body);
    const result = await interpretTrainerSession({ sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, actorGymId: req.user!.gymId ?? null, ...body });
    if (!result) return res.status(404).json({ error: "Session draft not found." });
    res.json(result);
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions/:sessionId/complete", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({ userConfirmed: z.literal(true), draft: draftSchema, narratives: narrativesSchema, completedAt: z.string().datetime().nullable().optional() }).parse(req.body);
    const result = await completeTrainerSession({ sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, trainerId: req.user!.trainerId ?? null, actorGymId: req.user!.gymId ?? null, draft: body.draft, narratives: body.narratives, completedAt: body.completedAt });
    if (!result) return res.status(404).json({ error: "Session draft not found." });
    res.json(result);
  } catch (error) { next(error); }
});

trainerSessionsRouter.delete("/trainer/clients/:clientId/coaching-sessions/:sessionId", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ cancelled: false });
    if (!await ensureClientAccess(req, req.params.clientId)) return res.status(403).json({ error: "You cannot manage this client." });
    res.json({ cancelled: await cancelTrainerSession(req.params.sessionId, req.params.clientId, req.user!.id) });
  } catch (error) { next(error); }
});

trainerSessionsRouter.get("/me/coaching-sessions", requireAuth, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ enabled: false, sessions: [] });
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) }).parse(req.query);
    res.json({ enabled: true, sessions: await getClientCoachedSessions(req.user!.id, limit) });
  } catch (error) { next(error); }
});
