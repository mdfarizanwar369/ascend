import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { canManageClient } from "../services/clientAccessService";
import {
  assignTrainerHomework,
  completeTrainerHomework,
  generateTrainerHomeworkPreview,
  getClientHomeworkById,
  getCurrentClientHomework,
  getTrainerHomeworkHistory,
  notifyHomeworkAssigned,
  trainerHomeworkEnabled
} from "../services/trainerHomeworkService";

export const trainerHomeworkRouter = Router();

const trainerHomeworkGenerateSchema = z.object({
  location: z.enum(["home", "commercial_gym", "hotel_gym", "outdoor", "minimal_equipment"]),
  timeAvailable: z.enum(["20", "30", "45", "60"]),
  goal: z.enum(["fat_loss", "strength", "hypertrophy", "mobility", "recovery", "conditioning", "technique", "cardio", "full_body"]),
  equipment: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  assignmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coachNote: z.string().trim().max(150).optional().nullable()
});

const homeworkWorkoutSchema = z.object({
  title: z.string().trim().min(2).max(120),
  intro: z.string().trim().min(2).max(220),
  estimatedDurationMinutes: z.number().int().min(5).max(180),
  focus: z.string().trim().min(2).max(100),
  intensity: z.enum(["easy", "moderate", "challenging"]),
  warmup: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  exercises: z.array(
    z.object({
      name: z.string().trim().min(1).max(120),
      sets: z.number().int().min(1).max(10).nullable().optional(),
      reps: z.string().trim().max(40).nullable().optional(),
      duration: z.string().trim().max(40).nullable().optional(),
      rest: z.string().trim().max(40).nullable().optional(),
      note: z.string().trim().max(160).nullable().optional()
    })
  ).min(1).max(20),
  cooldown: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  coachTip: z.string().trim().min(2).max(220),
  disclaimer: z.string().trim().min(2).max(220),
  whyItFits: z.string().trim().min(2).max(260)
});

const trainerHomeworkAssignSchema = trainerHomeworkGenerateSchema.extend({
  workout: homeworkWorkoutSchema
});

const trainerHomeworkCompletionSchema = z.object({
  completedAt: z.string().datetime().optional()
});

trainerHomeworkRouter.use((_req, res, next) => {
  if (!trainerHomeworkEnabled()) {
    return res.status(404).json({ error: "Coach Homework is not enabled." });
  }
  next();
});

trainerHomeworkRouter.post("/trainer/clients/:clientId/homework/generate", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const input = trainerHomeworkGenerateSchema.parse(req.body);
    const preview = await generateTrainerHomeworkPreview({
      clientId: req.params.clientId,
      trainerName: req.user!.email,
      ...input
    });
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

trainerHomeworkRouter.get("/trainer/clients/:clientId/homework", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const assignments = await getTrainerHomeworkHistory(req.params.clientId);
    res.json({
      assignments,
      summary: {
        assigned: assignments.filter((item) => item.status === "assigned").length,
        completed: assignments.filter((item) => item.status === "completed").length,
        missed: assignments.filter((item) => item.status === "missed").length
      }
    });
  } catch (error) {
    next(error);
  }
});

trainerHomeworkRouter.post("/trainer/clients/:clientId/homework", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const input = trainerHomeworkAssignSchema.parse(req.body);
    const assignment = await assignTrainerHomework({
      ...input,
      clientId: req.params.clientId,
      assignedByUserId: req.user!.id,
      trainerId: req.user!.trainerId ?? null
    });
    if (!assignment) return res.status(500).json({ error: "Could not create homework assignment" });
    await notifyHomeworkAssigned({
      assignmentId: assignment.id,
      userId: req.params.clientId,
      trainerName: assignment.trainer_name ?? req.user!.email,
      assignmentDate: input.assignmentDate
    }).catch(() => ({ sent: 0, skipped: true }));
    res.status(201).json({ assignment });
  } catch (error) {
    next(error);
  }
});

trainerHomeworkRouter.get("/me/coach-homework/current", requireAuth, async (req, res, next) => {
  try {
    if (!req.user?.roles.includes("client") && req.user?.primaryRole !== "client") return res.json({ assignment: null });
    const assignment = await getCurrentClientHomework(req.user!.id);
    res.json({ assignment });
  } catch (error) {
    next(error);
  }
});

trainerHomeworkRouter.get("/me/coach-homework/:assignmentId", requireAuth, async (req, res, next) => {
  try {
    if (!req.user?.roles.includes("client") && req.user?.primaryRole !== "client") return res.status(404).json({ error: "Homework not found" });
    const assignment = await getClientHomeworkById(req.user!.id, req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Homework not found" });
    res.json({ assignment });
  } catch (error) {
    next(error);
  }
});

trainerHomeworkRouter.post("/me/coach-homework/:assignmentId/complete", requireAuth, async (req, res, next) => {
  try {
    if (!req.user?.roles.includes("client") && req.user?.primaryRole !== "client") return res.status(404).json({ error: "Homework not found" });
    const input = trainerHomeworkCompletionSchema.parse(req.body);
    const result = await completeTrainerHomework({
      assignmentId: req.params.assignmentId,
      clientId: req.user!.id,
      completedAt: input.completedAt ?? new Date().toISOString()
    });
    if (!result) return res.status(404).json({ error: "Homework not found or no longer active" });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
