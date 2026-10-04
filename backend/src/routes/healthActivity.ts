import { Router } from "express";
import { z } from "zod";
import { HEALTH_ACTIVITY_CONSENT_VERSION, healthDateKey, validHealthTimezone } from "@ascend/shared";
import { requireAuth } from "../middleware/auth";
import {
  connectHealthActivity, disconnectHealthActivity, exportHealthActivity, getDailyHealthActivity,
  getHealthActivityStatus, healthActivityEnabled, healthActivityError, importHealthActivity, saveHealthManualLink
} from "../services/healthActivityService";

export const healthActivityRouter = Router();
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}, "Invalid calendar date");
const timezone = z.string().min(1).max(100).refine(validHealthTimezone,"Invalid reporting timezone");
const energy = z.number().finite().min(0).max(100_000).nullable();
const state = z.enum(["observed","unavailable"]);
const instant = z.string().datetime();

export const healthActivityImportSchema = z.object({
  schemaVersion: z.literal(2),requestId: uuid,installationId: uuid,connectionGeneration: uuid,calendarGeneration: uuid,
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  snapshots: z.array(z.object({
    day: date,timezone,windowStart: instant,windowEnd: instant,observedAt: instant,
    steps: z.number().int().nonnegative().max(1_000_000).nullable(),stepsState: state,
    activeCalories: energy,energyState: state
  })).max(60),
  workouts: z.array(z.object({
    externalId: z.string().min(1).max(200),startAt: instant,endAt: instant,
    activityType: z.string().min(1).max(100),activeCalories: energy,sourceName: z.string().max(200).nullable()
  })).max(200),
  deletedWorkoutIds: z.array(z.string().min(1).max(200)).max(200)
}).superRefine((input,ctx) => {
  if (input.snapshots.length + input.workouts.length + input.deletedWorkoutIds.length > 200) ctx.addIssue({ code:"custom",message:"Import at most 200 records per chunk" });
  const now = Date.now();
  for (const [index,snapshot] of input.snapshots.entries()) {
    const start = new Date(snapshot.windowStart).getTime();
    const end = new Date(snapshot.windowEnd).getTime();
    const duration = end - start;
    const validWindow = validHealthTimezone(snapshot.timezone) && duration >= 23 * 3600_000 && duration <= 25 * 3600_000
      && healthDateKey(snapshot.windowStart,snapshot.timezone) === snapshot.day
      && healthDateKey(new Date(end-1),snapshot.timezone) === snapshot.day
      && healthDateKey(snapshot.windowEnd,snapshot.timezone) !== snapshot.day;
    if (!validWindow) ctx.addIssue({ code:"custom",message:"Invalid reporting-day window",path:["snapshots",index] });
    if (start > now || start < now - 32 * 86400_000 || new Date(snapshot.observedAt).getTime() > now+300_000) {
      ctx.addIssue({ code:"custom",message:"Observation is outside the supported import range",path:["snapshots",index] });
    }
    if ((snapshot.stepsState === "observed") !== (snapshot.steps !== null) || (snapshot.energyState === "observed") !== (snapshot.activeCalories !== null)) {
      ctx.addIssue({ code:"custom",message:"Missing observations must remain null",path:["snapshots",index] });
    }
  }
  for (const [index,workout] of input.workouts.entries()) {
    const start = new Date(workout.startAt).getTime();
    const end = new Date(workout.endAt).getTime();
    if (end < start || end > now+300_000 || start < Date.UTC(2000,0,1)) ctx.addIssue({ code:"custom",message:"Invalid workout interval",path:["workouts",index] });
  }
  if (Buffer.byteLength(JSON.stringify(input),"utf8") > 256*1024) ctx.addIssue({ code:"custom",message:"Import chunk exceeds 256 KiB" });
});

function requireEnabled(userId: string) {
  if (!healthActivityEnabled(userId)) throw healthActivityError("Apple Health is not enabled for this account yet.",403);
}
healthActivityRouter.get("/health-sync/v2/status",requireAuth,async (req,res,next) => {
  try { res.json({ status:await getHealthActivityStatus(req.user!.id) }); } catch (error) { next(error); }
});
healthActivityRouter.post("/health-sync/v2/connect",requireAuth,async (req,res,next) => {
  try {
    requireEnabled(req.user!.id);
    const input = z.object({ installationId:uuid,timezone,consentVersion:z.literal(HEALTH_ACTIVITY_CONSENT_VERSION),
      consented:z.literal(true),select:z.boolean().default(false) }).parse(req.body);
    res.json(await connectHealthActivity(req.user!.id,input));
  } catch (error) { next(error); }
});
healthActivityRouter.post("/health-sync/v2/import",requireAuth,async (req,res,next) => {
  try {
    requireEnabled(req.user!.id);
    if (Buffer.byteLength(JSON.stringify(req.body),"utf8") > 256*1024) throw healthActivityError("Import chunk exceeds 256 KiB.",413);
    res.json(await importHealthActivity(req.user!.id,healthActivityImportSchema.parse(req.body)));
  } catch (error) { next(error); }
});
healthActivityRouter.get("/activity/daily",requireAuth,async (req,res,next) => {
  try { res.json({ summary:await getDailyHealthActivity(req.user!.id,req.query.day ? date.parse(req.query.day) : undefined) }); }
  catch (error) { next(error); }
});
healthActivityRouter.patch("/activity/manual/:activityId",requireAuth,async (req,res,next) => {
  try {
    requireEnabled(req.user!.id);
    const input = z.object({ untracked:z.boolean(),activeCalories:energy,matchedWorkoutId:z.string().max(200).nullable() })
      .refine(value => !value.untracked || (value.activeCalories !== null && value.matchedWorkoutId === null),"Untracked activity needs an active estimate and cannot be a matched workout").parse(req.body);
    res.json(await saveHealthManualLink(req.user!.id,{ ...input,activityId:uuid.parse(req.params.activityId) }));
  } catch (error) { next(error); }
});
healthActivityRouter.post("/health-sync/v2/disconnect",requireAuth,async (req,res,next) => {
  try { res.json(await disconnectHealthActivity(req.user!.id,uuid.parse(req.body.installationId))); } catch (error) { next(error); }
});
healthActivityRouter.delete("/health-sync/v2/history",requireAuth,async (req,res,next) => {
  try {
    const input = z.object({ installationId:uuid,confirmation:z.literal("DELETE IMPORTED HISTORY") }).parse(req.body);
    res.json(await disconnectHealthActivity(req.user!.id,input.installationId,true));
  } catch (error) { next(error); }
});
healthActivityRouter.get("/health-sync/v2/export",requireAuth,async (req,res,next) => {
  try { res.json(await exportHealthActivity(req.user!.id)); } catch (error) { next(error); }
});
