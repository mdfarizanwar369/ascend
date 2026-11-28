import { isIosFreeEdition } from "../services/appEdition";
import { Router } from "express";
import { z } from "zod";
import { TRAINER_SESSION_FOCUSES, TRAINER_SESSION_RESPONSES } from "@ascend/shared";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { getAssignedTrainerClient } from "../services/clientAccessService";
import { getAdminGymScope, getUserGymId, scopeAllowsGym } from "../services/adminScopeService";
import {
  cancelTrainerSession,
  completeTrainerSession,
  getClientCoachedSessions,
  getGymClientCoachingSessions,
  getTrainerSessionOverview,
  interpretTrainerSession,
  startTrainerSession,
  updateTrainerSessionDraft
} from "../services/trainerSessionService";
import { workoutCaptureDraftSchema, workoutCaptureExerciseSchema } from "../schemas/workoutCaptureSchemas";

export const trainerSessionsRouter = Router();

const draftSchema = workoutCaptureDraftSchema;
const worksheetWorkoutDraftSchema = draftSchema.extend({
  title: z.string().trim().max(120),
  workoutType: z.string().trim().max(80),
  exercises: z.array(workoutCaptureExerciseSchema.extend({ name: z.string().trim().max(120) })).max(30)
});

const narrativesSchema = z.object({
  clientRecap: z.string().trim().max(600),
  betweenSessionFocus: z.string().trim().max(400),
  trainerNextSessionNote: z.string().trim().max(600)
});

const worksheetFields = z.object({
  focus: z.enum(TRAINER_SESSION_FOCUSES).optional(),
  priority: z.string().trim().max(160).optional(),
  response: z.enum(TRAINER_SESSION_RESPONSES).optional(),
  win: z.string().trim().max(400).optional(),
  sessionNumber: z.int().positive().optional(),
  sessionsPurchased: z.int().positive().optional()
});

const worksheetSchema = worksheetFields.refine(({ sessionNumber, sessionsPurchased }) => (
  sessionNumber === undefined || sessionsPurchased === undefined || sessionNumber <= sessionsPurchased
), {
  message: "The session number must be within the package.",
  path: ["sessionNumber"]
});

const trainerGuard = [requireAuth, requireRole(["trainer"]), requireActivePlan("trainer_pro")] as const;

trainerSessionsRouter.get("/admin/users/:clientId/coaching-sessions", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ enabled: false, sessions: [] });
    const clientId = z.uuid().parse(req.params.clientId);
    const [scope, gymId] = await Promise.all([getAdminGymScope(req.user!), getUserGymId(clientId)]);
    if (!gymId || !scopeAllowsGym(scope, gymId)) return res.status(403).json({ error: "You cannot view this client's coaching sessions." });
    const sessions = await getGymClientCoachingSessions(clientId, scope.gymIds);
    res.json({ enabled: true, sessions: sessions.map(({ id, trainerName, completedAt, worksheet, narratives, workoutDraft, shareClientRecap }) => ({
      id, trainerName, completedAt, worksheet, narratives, shareClientRecap,
      title: workoutDraft?.title,
      exercises: workoutDraft?.exercises.map(({ name, sets, reps, load, loadUnit, durationMinutes, note }) => ({
        name, sets, reps, load, loadUnit, durationMinutes, note
      })) ?? []
    })) });
  } catch (error) { next(error); }
});

trainerSessionsRouter.get("/trainer/clients/:clientId/coaching-sessions", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ enabled: false, activeSession: null, recentSessions: [], previousWorkout: null });
    res.set("Cache-Control", "private, no-store");
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client) return res.status(403).json({ error: "You cannot manage this client." });
    res.json({ enabled: true, ...await getTrainerSessionOverview(req.params.clientId, req.user!.id, client.gym_id) });
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({ mode: z.enum(["repeat_last", "blank"]) }).parse(req.body);
    const session = await startTrainerSession({ clientId: req.params.clientId, actorUserId: req.user!.id, trainerId: req.user!.trainerId, gymId: client.gym_id, mode: body.mode });
    res.status(201).json({ session });
  } catch (error) { next(error); }
});

trainerSessionsRouter.patch("/trainer/clients/:clientId/coaching-sessions/:sessionId", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({
      version: z.int().positive(),
      rawInput: z.string().max(5_000),
      durationMinutes: z.int().min(5).max(300).nullable().optional(),
      workoutDraft: worksheetWorkoutDraftSchema.nullable().optional(),
      worksheet: worksheetFields.optional(),
      narratives: narrativesSchema.optional(),
      shareClientRecap: z.boolean().optional()
    }).parse(req.body);
    const session = await updateTrainerSessionDraft({ sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, gymId: client.gym_id, ...body });
    if (!session) return res.status(409).json({ error: "This session changed elsewhere. Refresh to continue." });
    res.json({ session });
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions/:sessionId/interpret", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({
      version: z.int().positive().optional(),
      rawInput: z.string().trim().min(2).max(5_000),
      durationMinutes: z.int().min(5).max(300),
      sourceMode: z.enum(["text", "dictation"]).default("text")
    }).parse(req.body);
    const result = await interpretTrainerSession({ sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, actorGymId: client.gym_id, ...body });
    if (!result) return res.status(404).json({ error: "Session draft not found." });
    res.json(result);
  } catch (error) { next(error); }
});

trainerSessionsRouter.post("/trainer/clients/:clientId/coaching-sessions/:sessionId/complete", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.status(404).json({ error: "Session capture is not available." });
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client || !req.user!.trainerId) return res.status(403).json({ error: "You cannot manage this client." });
    const body = z.object({
      userConfirmed: z.literal(true),
      version: z.int().positive().optional(),
      draft: draftSchema.refine((draft) => draft.exercises.every((exercise) => !exercise.needsConfirmation), "Confirm the highlighted exercises first."),
      narratives: narrativesSchema,
      worksheet: worksheetSchema.default({}),
      shareClientRecap: z.boolean().default(false),
      completedAt: z.string().datetime().nullable().optional()
    }).refine((input) => !input.shareClientRecap || Boolean(
      input.narratives.clientRecap || input.narratives.betweenSessionFocus || input.worksheet.sessionNumber || input.worksheet.sessionsPurchased
    ), {
      message: "Add a recap, between-session focus, or package progress to share.",
      path: ["narratives"]
    }).parse(req.body);
    const result = await completeTrainerSession({ ...body, sessionId: req.params.sessionId, clientId: req.params.clientId, actorUserId: req.user!.id, trainerId: req.user!.trainerId, gymId: client.gym_id });
    if (!result) return res.status(404).json({ error: "Session draft not found." });
    res.json(result);
  } catch (error) { next(error); }
});

trainerSessionsRouter.delete("/trainer/clients/:clientId/coaching-sessions/:sessionId", ...trainerGuard, async (req, res, next) => {
  try {
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ cancelled: false });
    const client = await getAssignedTrainerClient(req.user!, req.params.clientId);
    if (!client) return res.status(403).json({ error: "You cannot manage this client." });
    const { version } = z.object({ version: z.coerce.number().int().positive().optional() }).parse(req.query);
    res.json({ cancelled: await cancelTrainerSession(req.params.sessionId, req.params.clientId, req.user!.id, client.gym_id, version) });
  } catch (error) { next(error); }
});

trainerSessionsRouter.get("/me/coaching-sessions", requireAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    if (isIosFreeEdition()) return res.json({ enabled: false, sessions: [] });
    if (!env.TRAINER_SESSION_CAPTURE_V1) return res.json({ enabled: false, sessions: [] });
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) }).parse(req.query);
    res.json({ enabled: true, sessions: await getClientCoachedSessions(req.user!.id, limit) });
  } catch (error) { next(error); }
});
