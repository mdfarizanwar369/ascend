import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { challengeTemplates, isAscendNativeUserAgent, shiftPtDate } from "@ascend/shared";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { isIosNativeRequest } from "../services/appEdition";
import { completeChallengeMealDay, getMonthlyChallenge, joinMonthlyChallenge, leaveMonthlyChallenge, listMonthlyChallenges, saveMonthlyChallenge } from "../services/monthlyChallengeService";

export const monthlyChallengesRouter = Router();
const roleSchema = z.enum(["member", "trainer", "gym"]);
const access = { member: requireRole(["client"]), trainer: requireRole(["trainer"]), gym: requireRole(["owner", "admin"]) };
const guard: RequestHandler = (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  const role = roleSchema.safeParse(req.params.role);
  if (!env.MONTHLY_CHALLENGES_V1 || !role.success
    || isIosNativeRequest(req) || isAscendNativeUserAgent(req.get("User-Agent") ?? "")) {
    res.status(404).json({ error: "Challenges are currently unavailable." });
    return;
  }
  return access[role.data](req, res, next);
};
const challengeId = z.uuid();
const saveSchema = z.strictObject({
  gymId: z.uuid(),
  publish: z.boolean(),
  title: z.string().trim().min(1).max(64),
  template: z.enum(challengeTemplates),
  actions: z.array(z.enum(challengeTemplates)).min(1).max(3),
  requiredActions: z.int().min(1).max(3),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  goalDays: z.int().min(1).max(31),
  leaderboard: z.boolean(),
  version: z.int().positive().optional()
}).refine(({ actions, requiredActions }) => new Set(actions).size === actions.length && requiredActions <= actions.length,
  { message: "Choose distinct activities and a valid daily requirement.", path: ["requiredActions"] })
  .refine(({ startsOn, endsOn, goalDays }) => startsOn.slice(0, 4) >= "2000" && startsOn.slice(0, 4) <= "2099"
    && endsOn <= shiftPtDate(startsOn, 30) && endsOn >= shiftPtDate(startsOn, goalDays - 1),
  { message: "Choose up to 31 days and a goal that fits in that date range.", path: ["endsOn"] });

monthlyChallengesRouter.get("/monthly-challenges/:role", requireAuth, guard, async (req, res, next) => {
  try { res.json(await listMonthlyChallenges(req.user!, roleSchema.parse(req.params.role))); }
  catch (error) { next(error); }
});

monthlyChallengesRouter.get("/monthly-challenges/:role/:id", requireAuth, guard, async (req, res, next) => {
  try { res.json(await getMonthlyChallenge(req.user!, roleSchema.parse(req.params.role), challengeId.parse(req.params.id))); }
  catch (error) { next(error); }
});

const save: RequestHandler = async (req, res, next) => {
  try {
    const role = z.enum(["trainer", "gym"]).parse(req.params.role);
    const { gymId, publish, version, ...rules } = saveSchema.parse(req.body);
    const edit = req.params.id ? { id: challengeId.parse(req.params.id), version: z.int().positive().parse(version) } : undefined;
    res.status(edit ? 200 : 201).json(await saveMonthlyChallenge(req.user!, role, rules, gymId, publish, edit));
  } catch (error) { next(error); }
};
monthlyChallengesRouter.post("/monthly-challenges/:role", requireAuth, guard, save);
monthlyChallengesRouter.put("/monthly-challenges/:role/:id", requireAuth, guard, save);

const participantGuard = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) => {
  if (req.params.role !== "member") return res.status(404).json({ error: "This action requires a member account." });
  return guard(req, res, next);
};
monthlyChallengesRouter.put("/monthly-challenges/:role/:id/membership", requireAuth, participantGuard, async (req, res, next) => {
  try {
    const { displayName } = z.strictObject({ displayName: z.string().trim().min(1).max(28).nullable() }).parse(req.body);
    await joinMonthlyChallenge(req.user!, challengeId.parse(req.params.id), displayName);
    res.json({ saved: true });
  } catch (error) { next(error); }
});
monthlyChallengesRouter.delete("/monthly-challenges/:role/:id/membership", requireAuth, participantGuard, async (req, res, next) => {
  try {
    await leaveMonthlyChallenge(req.user!, challengeId.parse(req.params.id));
    res.json({ saved: true });
  } catch (error) { next(error); }
});
monthlyChallengesRouter.put("/monthly-challenges/:role/:id/meal-day", requireAuth, participantGuard, async (req, res, next) => {
  try {
    const { day } = z.strictObject({ day: z.iso.date() }).parse(req.body);
    await completeChallengeMealDay(req.user!, challengeId.parse(req.params.id), day);
    res.json({ saved: true });
  } catch (error) { next(error); }
});
