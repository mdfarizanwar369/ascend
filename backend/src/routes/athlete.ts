import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { env } from "../config/env";
import { canManageClient } from "../services/clientAccessService";
import { buildWeeklySummary, calculateReadiness, calculateTargetCompliance, eventCountdown } from "../services/athleteService";
import { createReadUrl } from "../integrations/s3";

export const athleteRouter = Router();

const profileSchema = z.object({
  sport: z.string().trim().min(2).max(80).nullable().optional(),
  division: z.string().trim().max(80).nullable().optional(),
  competitionName: z.string().trim().max(120).nullable().optional(),
  competitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  coachName: z.string().trim().max(120).nullable().optional(),
  goalWeightKg: z.number().min(25).max(400).nullable().optional()
});

const readinessSchema = z.object({
  checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sleepHours: z.number().min(0).max(16),
  energy: z.number().int().min(1).max(10),
  soreness: z.number().int().min(1).max(10),
  stress: z.number().int().min(1).max(10),
  hunger: z.number().int().min(1).max(10),
  motivation: z.number().int().min(1).max(10)
});

const targetSchema = z.object({
  targetType: z.enum(["runs", "cardio_minutes", "steps", "strength_sessions", "mobility_sessions", "recovery_days", "custom"]),
  targetValue: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(30),
  notes: z.string().trim().max(240).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const progressSchema = z.object({
  completedValue: z.number().min(0).max(1_000_000),
  progressDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const reviewCommentSchema = z.object({ coachComment: z.string().trim().max(2000).nullable() });
const activationSchema = z.object({ enabled: z.boolean() });

async function athleteProfile(userId: string) {
  const result = await query(`
    select ap.*, latest_weight.weight_kg as current_weight_kg
    from athlete_profiles ap
    left join lateral (
      select weight_kg from weight_logs where user_id = ap.user_id order by logged_at desc limit 1
    ) latest_weight on true
    where ap.user_id = $1
  `, [userId]);
  return result.rows[0] ?? null;
}

async function requireEnabledAthlete(userId: string) {
  if (!env.ATHLETE_MODE_ENABLED) return null;
  const profile = await athleteProfile(userId);
  return profile?.enabled ? profile : null;
}

async function currentTargets(userId: string) {
  const result = await query(`
    select t.*, coalesce(sum(p.completed_value), 0) as completed_value
    from athlete_weekly_targets t
    left join athlete_target_progress p on p.target_id = t.id
    where t.user_id = $1 and t.week_start = date_trunc('week', current_date)::date
    group by t.id
    order by t.created_at
  `, [userId]);
  return result.rows;
}

async function dashboardFor(userId: string) {
  const [profile, checkins, targets, review, photos] = await Promise.all([
    athleteProfile(userId),
    query(`select * from athlete_readiness_checkins where user_id = $1 order by checkin_date desc limit 14`, [userId]),
    currentTargets(userId),
    query(`select * from athlete_weekly_reviews where user_id = $1 order by week_start desc limit 1`, [userId]),
    query<{ id: string; photo_type: string; image_s3_key: string | null; logged_at: string }>(
      `select id, photo_type, image_s3_key, logged_at from progress_photos where user_id = $1 order by logged_at desc limit 4`,
      [userId]
    )
  ]);
  const normalizedTargets = targets.map((target) => ({
    ...target,
    target_value: Number(target.target_value),
    completed_value: Number(target.completed_value)
  }));
  const compliance = calculateTargetCompliance(normalizedTargets.map((target) => ({
    targetValue: target.target_value,
    completedValue: target.completed_value
  })));
  const latestCheckin = checkins.rows[0] ?? null;
  return {
    profile,
    countdown: eventCountdown(profile?.competition_date),
    latestCheckin,
    checkins: checkins.rows,
    targets: normalizedTargets,
    compliancePercent: compliance,
    latestReview: review.rows[0] ?? null,
    progressPhotos: await Promise.all(photos.rows.map(async (photo) => ({
      ...photo,
      image_url: photo.image_s3_key ? await createReadUrl(photo.image_s3_key) : null
    })))
  };
}

athleteRouter.get("/athlete/me", requireAuth, async (req, res, next) => {
  try {
    const profile = await requireEnabledAthlete(req.user!.id);
    if (!profile) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    res.json({ athlete: await dashboardFor(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

athleteRouter.patch("/athlete/me/profile", requireAuth, async (req, res, next) => {
  try {
    const current = await requireEnabledAthlete(req.user!.id);
    if (!current) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const input = profileSchema.parse(req.body);
    const result = await query(`
      update athlete_profiles set
        sport = coalesce($2, sport), division = $3, competition_name = $4,
        competition_date = $5::date, coach_name = $6, goal_weight_kg = $7, updated_at = now()
      where user_id = $1 and enabled = true
      returning *
    `, [req.user!.id, input.sport ?? null, input.division ?? null, input.competitionName ?? null,
      input.competitionDate ?? null, input.coachName ?? null, input.goalWeightKg ?? null]);
    res.json({ profile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.post("/athlete/me/checkins", requireAuth, async (req, res, next) => {
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const input = readinessSchema.parse(req.body);
    const readiness = calculateReadiness(input);
    const result = await query(`
      insert into athlete_readiness_checkins (
        user_id, checkin_date, sleep_hours, energy, soreness, stress, hunger, motivation, readiness_score, readiness_band
      ) values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (user_id, checkin_date) do update set
        sleep_hours = excluded.sleep_hours, energy = excluded.energy, soreness = excluded.soreness,
        stress = excluded.stress, hunger = excluded.hunger, motivation = excluded.motivation,
        readiness_score = excluded.readiness_score, readiness_band = excluded.readiness_band, updated_at = now()
      returning *
    `, [req.user!.id, input.checkinDate ?? null, input.sleepHours, input.energy, input.soreness, input.stress,
      input.hunger, input.motivation, readiness.score, readiness.band]);
    res.status(201).json({ checkin: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.put("/athlete/me/targets/:targetId/progress", requireAuth, async (req, res, next) => {
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const input = progressSchema.parse(req.body);
    const result = await query(`
      insert into athlete_target_progress (target_id, user_id, progress_date, completed_value)
      select id, user_id, coalesce($3::date, current_date), $2
      from athlete_weekly_targets where id = $1 and user_id = $4
      on conflict (target_id, progress_date) do update set completed_value = excluded.completed_value, updated_at = now()
      returning *
    `, [req.params.targetId, input.completedValue, input.progressDate ?? null, req.user!.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Training target not found." });
    res.json({ progress: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.post("/athlete/me/reviews/generate", requireAuth, async (req, res, next) => {
  try {
    if (!await requireEnabledAthlete(req.user!.id)) return res.status(404).json({ error: "Athlete Mode is not enabled for this account." });
    const stats = await query(`
      select date_trunc('week', current_date)::date as week_start,
        (date_trunc('week', current_date) + interval '6 days')::date as week_end,
        avg(readiness_score)::numeric(5,2) as readiness_average,
        count(*)::int as checkins_completed
      from athlete_readiness_checkins
      where user_id = $1 and checkin_date between date_trunc('week', current_date)::date and (date_trunc('week', current_date) + interval '6 days')::date
    `, [req.user!.id]);
    const row = stats.rows[0];
    const targets = await currentTargets(req.user!.id);
    const compliancePercent = calculateTargetCompliance(targets.map((target) => ({
      targetValue: Number(target.target_value), completedValue: Number(target.completed_value)
    })));
    const readinessAverage = row.readiness_average === null ? null : Number(row.readiness_average);
    const summary = buildWeeklySummary({ readinessAverage, compliancePercent, checkinsCompleted: Number(row.checkins_completed) });
    const result = await query(`
      insert into athlete_weekly_reviews (
        user_id, week_start, week_end, readiness_average, compliance_percent, checkins_completed, summary
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (user_id, week_start) do update set
        readiness_average = excluded.readiness_average, compliance_percent = excluded.compliance_percent,
        checkins_completed = excluded.checkins_completed, summary = excluded.summary, updated_at = now()
      returning *
    `, [req.user!.id, row.week_start, row.week_end, readinessAverage, compliancePercent, row.checkins_completed, summary]);
    res.status(201).json({ review: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.get("/trainer/clients/:clientId/athlete", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    if (!await requireEnabledAthlete(req.params.clientId)) return res.status(404).json({ error: "Athlete Mode is not enabled for this client." });
    res.json({ athlete: await dashboardFor(req.params.clientId) });
  } catch (error) {
    next(error);
  }
});

athleteRouter.post("/trainer/clients/:clientId/athlete/targets", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    if (!await requireEnabledAthlete(req.params.clientId)) return res.status(404).json({ error: "Athlete Mode is not enabled for this client." });
    const input = targetSchema.parse(req.body);
    const result = await query(`
      insert into athlete_weekly_targets (user_id, assigned_by_user_id, week_start, target_type, target_value, unit, notes)
      values ($1, $2, coalesce($3::date, date_trunc('week', current_date)::date), $4, $5, $6, $7)
      on conflict (user_id, week_start, target_type) do update set
        assigned_by_user_id = excluded.assigned_by_user_id, target_value = excluded.target_value,
        unit = excluded.unit, notes = excluded.notes, updated_at = now()
      returning *
    `, [req.params.clientId, req.user!.id, input.weekStart ?? null, input.targetType, input.targetValue, input.unit, input.notes ?? null]);
    res.status(201).json({ target: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.get("/trainer/clients/:clientId/athlete/notes", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(`
      select n.*, u.full_name as author_name from athlete_coach_notes n
      join users u on u.id = n.author_user_id
      where n.user_id = $1 order by n.created_at desc limit 50
    `, [req.params.clientId]);
    res.json({ notes: result.rows });
  } catch (error) {
    next(error);
  }
});

athleteRouter.post("/trainer/clients/:clientId/athlete/notes", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    if (!await requireEnabledAthlete(req.params.clientId)) return res.status(404).json({ error: "Athlete Mode is not enabled for this client." });
    const input = noteSchema.parse(req.body);
    const result = await query(`
      insert into athlete_coach_notes (user_id, author_user_id, body) values ($1, $2, $3) returning *
    `, [req.params.clientId, req.user!.id, input.body]);
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.patch("/trainer/clients/:clientId/athlete/review", requireAuth, requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const input = reviewCommentSchema.parse(req.body);
    const result = await query(`
      update athlete_weekly_reviews set coach_comment = $2, reviewed_by_user_id = $3, updated_at = now()
      where user_id = $1 and week_start = date_trunc('week', current_date)::date returning *
    `, [req.params.clientId, input.coachComment, req.user!.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Ask the athlete to generate this week's review first." });
    res.json({ review: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

athleteRouter.patch("/admin/users/:userId/athlete-mode", requireAuth, requireRole(["owner"]), async (req, res, next) => {
  try {
    if (!env.ATHLETE_MODE_ENABLED) return res.status(503).json({ error: "Athlete Mode is disabled globally." });
    const input = activationSchema.parse(req.body);
    if (!await canManageClient(req.user!, req.params.userId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(`
      insert into athlete_profiles (user_id, enabled, activated_by_user_id, activated_at)
      values ($1, $2, $3, case when $2 then now() else null end)
      on conflict (user_id) do update set enabled = excluded.enabled,
        activated_by_user_id = excluded.activated_by_user_id,
        activated_at = case when excluded.enabled then coalesce(athlete_profiles.activated_at, now()) else athlete_profiles.activated_at end,
        updated_at = now()
      returning *
    `, [req.params.userId, input.enabled, req.user!.id]);
    res.json({ athleteProfile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
