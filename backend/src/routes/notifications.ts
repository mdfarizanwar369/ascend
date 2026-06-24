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

export const notificationsRouter = Router();

const platformSchema = z.enum(["android", "ios", "desktop", "web"]);

const registerDeviceSchema = z.object({
  fcmToken: z.string().min(20),
  platform: platformSchema.default("web")
});

const unregisterDeviceSchema = z.object({
  fcmToken: z.string().min(20)
});

const activitySchema = z.object({
  screenName: z.string().min(1).max(80).default("app")
});

notificationsRouter.post("/notifications/devices", requireAuth, async (req, res, next) => {
  try {
    const input = registerDeviceSchema.parse(req.body);
    const device = await registerNotificationDevice({
      userId: req.user!.id,
      fcmToken: input.fcmToken,
      platform: input.platform,
      userAgent: req.header("user-agent")
    });
    res.status(201).json({ device });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.delete("/notifications/devices", requireAuth, async (req, res, next) => {
  try {
    const input = unregisterDeviceSchema.parse(req.body);
    await disableNotificationDevice(req.user!.id, input.fcmToken);
    res.json({ disabled: true });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post("/notifications/activity", requireAuth, async (req, res, next) => {
  try {
    const input = activitySchema.parse(req.body);
    await recordNotificationActivity(req.user!.id, input.screenName);
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
    const result = await runCoachNotificationJob();
    res.json({ status: "ok", job: "notifications", completedAt: new Date().toISOString(), ...result });
  } catch (error) {
    next(error);
  }
});
