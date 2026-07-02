import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { uploadRateLimit } from "../middleware/rateLimits";
import { acknowledgeGoalMilestone, completeOnboarding, getGoalStatus, guideProfileSchema, onboardingSchema, updateGuideProfile } from "../services/userService";
import { getProgressComparison } from "../services/progressComparisonService";
import { createReadUrl, deleteStoredObjects, uploadDataUrl } from "../integrations/s3";
import { imageDataUrlSchema, parseImageDataUrl } from "../utils/images";
import { withProfilePhotoUrl } from "../services/profilePhotoService";
import { bodyCompositionForNutrition, bodyCompositionScanFromDb } from "../services/bodyCompositionService";

export const meRouter = Router();

meRouter.get("/me", requireAuth, async (req, res) => {
  const result = await query(
    `
    select u.*, trainer_user.full_name as assigned_trainer_name, current_trainer.status as trainer_status,
      coalesce(athlete_profile.enabled, false) as athlete_mode_enabled
    from users u
    left join trainers current_trainer on current_trainer.user_id = u.id
    left join trainers t on t.id = u.assigned_trainer_id
    left join users trainer_user on trainer_user.id = t.user_id
    left join athlete_profiles athlete_profile on athlete_profile.user_id = u.id
    where u.id = $1
    `,
    [req.user!.id]
  );
  const user = await withProfilePhotoUrl(result.rows[0]);
  if (user?.athlete_mode_enabled === true) {
    const scanResult = await query(
      `
      select *
      from body_composition_scans
      where user_id = $1
        and user_confirmed = true
      order by scan_date desc, created_at desc
      limit 10
      `,
      [req.user!.id]
    );
    user.body_composition_nutrition = bodyCompositionForNutrition(scanResult.rows.map(bodyCompositionScanFromDb)) ?? null;
  }
  res.json({ user: { ...user, is_platform_owner: req.user!.isPlatformOwner }, roles: req.user!.roles });
});

const MAX_PROFILE_PHOTO_BYTES = 400 * 1024;
const profilePhotoSchema = z.object({
  imageDataUrl: imageDataUrlSchema.refine(
    (value) => parseImageDataUrl(value).buffer.byteLength <= MAX_PROFILE_PHOTO_BYTES,
    "Profile photo must be compressed to 400 KB or smaller."
  )
});

meRouter.post("/me/profile-photo", requireAuth, requireActivePlan("premium"), uploadRateLimit, async (req, res, next) => {
  let newKey: string | null = null;
  let profileUpdated = false;
  try {
    const input = profilePhotoSchema.parse(req.body);
    const { contentType } = parseImageDataUrl(input.imageDataUrl);
    const extension = contentType === "image/webp" ? "webp" : contentType === "image/png" ? "png" : "jpg";
    newKey = `profiles/${req.user!.id}/${randomUUID()}.${extension}`;
    const upload = await uploadDataUrl(newKey, input.imageDataUrl);
    if (upload.storageConfigured === false) return res.status(503).json({ error: "Profile photo storage is unavailable." });

    const previous = await query<{ profile_photo_s3_key: string | null }>(
      "select profile_photo_s3_key from users where id = $1",
      [req.user!.id]
    );
    const oldKey = previous.rows[0]?.profile_photo_s3_key;
    const result = await query<{ profile_photo_s3_key: string | null }>(
      `
      update users
      set profile_photo_s3_key = $2, updated_at = now()
      where id = $1
      returning profile_photo_s3_key
      `,
      [req.user!.id, newKey]
    );
    if (!result.rows[0]) throw new Error("Profile could not be updated.");
    profileUpdated = true;
    if (oldKey && oldKey !== newKey) deleteStoredObjects([oldKey]).catch(() => undefined);

    res.json({ profilePhotoUrl: await createReadUrl(newKey) });
  } catch (error) {
    if (newKey && !profileUpdated) await deleteStoredObjects([newKey]).catch(() => undefined);
    next(error);
  }
});

meRouter.delete("/me/profile-photo", requireAuth, async (req, res, next) => {
  try {
    const previous = await query<{ profile_photo_s3_key: string | null }>(
      "select profile_photo_s3_key from users where id = $1",
      [req.user!.id]
    );
    const oldKey = previous.rows[0]?.profile_photo_s3_key;
    await query(
      `
      update users
      set profile_photo_s3_key = null, updated_at = now()
      where id = $1
      `,
      [req.user!.id]
    );
    if (oldKey) await deleteStoredObjects([oldKey]).catch(() => undefined);
    res.json({ removed: true });
  } catch (error) {
    next(error);
  }
});

meRouter.post("/me/onboarding", requireAuth, async (req, res, next) => {
  try {
    const input = onboardingSchema.parse(req.body);
    const user = await completeOnboarding(req.user!.id, input);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/me/guide-profile", requireAuth, async (req, res, next) => {
  try {
    const input = guideProfileSchema.parse(req.body);
    const user = await updateGuideProfile(req.user!.id, input);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

meRouter.get("/me/goal-status", requireAuth, async (req, res, next) => {
  try {
    res.json({ goalStatus: await getGoalStatus(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

meRouter.get("/me/progress-comparison", requireAuth, async (req, res, next) => {
  try {
    res.json({ comparison: await getProgressComparison(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/me/goal-milestones/:milestoneId/acknowledge", requireAuth, async (req, res, next) => {
  try {
    const milestone = await acknowledgeGoalMilestone(req.user!.id, req.params.milestoneId);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    res.json({ milestone });
  } catch (error) {
    next(error);
  }
});
