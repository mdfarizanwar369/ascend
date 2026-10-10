import { Router, type NextFunction, type Request, type Response } from "express";
import { parseBearerToken, requireAuth } from "../middleware/auth";
import { siriSessionRateLimit } from "../middleware/rateLimits";
import { findSiriSessionUser, issueSiriSession, revokeSiriSession } from "../services/siriSessionService";
import { getVoiceTodayData, voiceTodayQuery } from "../services/voiceTodayService";
import { getVoiceQuestionData, voiceQuestionQuery } from "../services/voiceQuestionService";
import { getWidgetTodayData, widgetTodayQuery } from "../services/widgetTodayService";

export const siriRouter = Router();

siriRouter.post("/me/siri/connect", requireAuth, siriSessionRateLimit, async (req, res, next) => {
  try {
    res.json(await issueSiriSession(req.user!.id));
  } catch (error) { next(error); }
});

async function requireSiriSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req.header("Authorization"));
    const userId = token ? await findSiriSessionUser(token) : null;
    if (!userId) return res.status(401).json({ error: "Open Ascend and make sure you are signed in." });
    res.locals.siriUserId = userId;
    next();
  } catch (error) { next(error); }
}

siriRouter.get("/siri/today", requireSiriSession, async (req, res, next) => {
  try {
    const data = await getVoiceTodayData(res.locals.siriUserId as string, voiceTodayQuery.parse(req.query));
    res.json(data);
  } catch (error) { next(error); }
});

siriRouter.get("/siri/widget", requireSiriSession, async (req, res, next) => {
  try {
    const data = await getWidgetTodayData(res.locals.siriUserId as string, widgetTodayQuery.parse(req.query));
    res.setHeader("Cache-Control", "private, no-store");
    res.json(data);
  } catch (error) { next(error); }
});

siriRouter.post("/siri/ask", requireSiriSession, async (req, res, next) => {
  try {
    const data = await getVoiceQuestionData(res.locals.siriUserId as string, voiceQuestionQuery.parse(req.body));
    res.setHeader("Cache-Control", "private, no-store");
    res.json(data);
  } catch (error) { next(error); }
});

siriRouter.post("/siri/disconnect", requireSiriSession, async (req, res, next) => {
  try {
    await revokeSiriSession(parseBearerToken(req.header("Authorization"))!);
    res.status(204).end();
  } catch (error) { next(error); }
});
