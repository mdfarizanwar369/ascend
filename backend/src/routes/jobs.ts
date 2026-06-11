import { Router } from "express";
import { env } from "../config/env";
import { runDailyJobs } from "../jobs/runDailyJobs";

export const jobsRouter = Router();

function hasValidJobSecret(value: string | undefined) {
  return Boolean(env.CRON_SECRET && value && value === env.CRON_SECRET);
}

jobsRouter.post("/jobs/daily", async (req, res, next) => {
  try {
    const token = req.header("x-cron-secret") ?? req.query.secret?.toString();

    if (!hasValidJobSecret(token)) {
      return res.status(401).json({ error: "Invalid daily jobs secret" });
    }

    await runDailyJobs();
    res.json({ status: "ok", job: "daily", completedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});
