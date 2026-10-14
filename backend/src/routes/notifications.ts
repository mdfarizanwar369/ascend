import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import {
  disableNotificationDevice,
  recordNotificationActivity,
  registerNotificationDevice,
  runCoachNotificationJob
} from "../services/notificationService";
import { env } from "../config/env";
import { query } from "../db/pool";
import rateLimit from "express-rate-limit";
import { validTimezone } from "@ascend/shared";
import { apnsReady } from "../integrations/nudgePush";
import { nudgePreferencesSchema, nudgesSchemaEnabled } from "../services/smartNudgePolicy";
import { getNudgePreferences, saveNudgePreferences, listWorkoutSchedule, saveWorkoutSchedule, resolveNudgeOpen,
  NudgeRequestError, runSmartNudges, nudgeQueueHealth, recordNudgeAppOpen, retainNudgeHistory, completeScheduledWorkout } from "../services/smartNudgeService";

export const notificationsRouter = Router();
const notificationWriteLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: req => req.user!.id, message: { error: "Please wait a moment before updating notifications again." } });

const platformSchema = z.enum(["android", "ios", "desktop", "web"]);

const registerDeviceSchema = z.object({
  fcmToken: z.string().min(20).max(4096),
  provider: z.enum(["fcm", "apns"]).default("fcm"),
  timezone: z.string().max(100).refine(validTimezone).optional(),
  platform: platformSchema.default("web"),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0)
});

const unregisterDeviceSchema = z.object({
  fcmToken: z.string().min(20).max(4096)
});

const activitySchema = z.object({
  screenName: z.string().min(1).max(80).default("app"),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional()
});

notificationsRouter.post("/notifications/devices", requireAuth, notificationWriteLimit, async (req, res, next) => {
  try {
    const input = registerDeviceSchema.parse(req.body);
    const device = await registerNotificationDevice({
      userId: req.user!.id,
      fcmToken: input.fcmToken,
      provider: input.provider,
      timezone: input.timezone,
      platform: input.platform,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      userAgent: req.header("user-agent")
    });
    res.status(201).json({ device });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.delete("/notifications/devices", requireAuth, notificationWriteLimit, async (req, res, next) => {
  try {
    const input = unregisterDeviceSchema.parse(req.body);
    await disableNotificationDevice(req.user!.id, input.fcmToken);
    res.json({ disabled: true });
  } catch (error) {
    next(error);
  }
});
notificationsRouter.post("/notifications/devices/status", requireAuth, notificationWriteLimit, async (req, res, next) => {
  try {
    const { fcmToken } = unregisterDeviceSchema.parse(req.body);
    const result = await query("select 1 from notification_devices where user_id=$1 and fcm_token=$2 and enabled=true", [req.user!.id, fcmToken]);
    res.json({ registered: Boolean(result.rowCount) });
  } catch (error) { next(error); }
});

notificationsRouter.post("/notifications/activity", requireAuth, notificationWriteLimit, async (req, res, next) => {
  try {
    const input = activitySchema.parse(req.body);
    await recordNotificationActivity(req.user!.id, input.screenName, input.timezoneOffsetMinutes);
    await recordNudgeAppOpen(req.user!.id);
    res.json({ recorded: true });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post("/jobs/notifications", async (req, res, next) => {
  try {
    const token = req.header("x-cron-secret");
    if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
      return res.status(401).json({ error: "Invalid notification jobs secret" });
    }
    const legacy = await runCoachNotificationJob();
    res.json({ status: "ok", job: "notifications", completedAt: new Date().toISOString(), ...legacy });
  } catch (error) {
    next(error);
  }
});

const preferenceLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: req => req.user!.id, message: { error: "Please wait a moment before changing reminders again." } });
notificationsRouter.post("/jobs/notifications/nudges", async (req, res, next) => {
  try {
    if (!env.CRON_SECRET || req.header("x-cron-secret") !== env.CRON_SECRET) return res.sendStatus(401);
    res.json({ ...await runSmartNudges(), queue: await nudgeQueueHealth() });
  } catch (error) { next(error); }
});
const scheduleSchema = z.object({ id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(80), startsAt: z.string().datetime({ offset: true }),
  leadMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]),
  status: z.enum(["planned", "completed", "cancelled"]) }).strict();
notificationsRouter.get("/notifications/preferences", requireAuth, async (req, res, next) => {
  try { res.json({ ...await getNudgePreferences(req.user!.id), apnsAvailable: apnsReady() }); } catch (error) { next(error); }
});
notificationsRouter.put("/notifications/preferences", requireAuth, preferenceLimit, async (req, res, next) => {
  try {
    const input = z.object({ preferences: nudgePreferencesSchema, version: z.number().int().nonnegative() }).strict().parse(req.body);
    res.json(await saveNudgePreferences(req.user!.id, input.preferences, input.version));
  } catch (error) { if (error instanceof NudgeRequestError) return res.status(error.status).json({ error: error.message }); next(error); }
});
notificationsRouter.get("/notifications/workout-schedule", requireAuth, async (req, res, next) => {
  try { res.json({ sessions: await listWorkoutSchedule(req.user!.id) }); } catch (error) { next(error); }
});
notificationsRouter.put("/notifications/workout-schedule", requireAuth, preferenceLimit, async (req, res, next) => {
  try { res.json(await saveWorkoutSchedule(req.user!.id, scheduleSchema.parse(req.body))); }
  catch (error) { if (error instanceof NudgeRequestError) return res.status(error.status).json({ error: error.message }); next(error); }
});
notificationsRouter.post("/notifications/open", requireAuth, preferenceLimit, async (req, res, next) => {
  try { const input = z.object({ id: z.string().uuid() }).strict().parse(req.body); res.json(await resolveNudgeOpen(req.user!.id, input.id)); } catch (error) { next(error); }
});
notificationsRouter.post("/notifications/workout-schedule/complete", requireAuth, preferenceLimit, async (req, res, next) => {
  try {
    const input = z.object({ scheduleId: z.string().uuid(), eventId: z.string().uuid() }).strict().parse(req.body);
    const completed = await completeScheduledWorkout(req.user!.id, input.scheduleId, input.eventId);
    res.status(completed ? 200 : 404).json(completed ? { completed } : { error: "This session or activity is no longer available." });
  } catch (error) { next(error); }
});
notificationsRouter.post("/jobs/notifications/retention", async (req, res, next) => {
  try {
    if (!env.CRON_SECRET || req.header("x-cron-secret") !== env.CRON_SECRET) return res.sendStatus(401);
    if (nudgesSchemaEnabled()) await retainNudgeHistory();
    res.json({ ok: true });
  } catch (error) { next(error); }
});
