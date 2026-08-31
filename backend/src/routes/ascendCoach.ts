import { Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ASCEND_COACH_DATA_SCOPES } from "../services/ascendCoachPolicyService";
import {
  CoachFoundationError,
  acceptCoachInvitation,
  declineCoachInvitation,
  endCoachRelationship,
  getMyCoachAccess,
  grantBreakGlassAccess,
  grantCoachPilotAccess,
  inviteCoachClient,
  listTrainerCoachRelationships,
  requestCoachScopeChange,
  revokeBreakGlassAccess,
  revokeCoachPilotAccess,
  revokeCoachRelationship
} from "../services/ascendCoachRelationshipService";

export const ascendCoachRouter = Router();

const scopeSchema = z.enum(ASCEND_COACH_DATA_SCOPES);
const invitationSchema = z.object({
  clientEmail: z.string().trim().email().max(320),
  requestedScopes: z.array(scopeSchema).min(1).max(ASCEND_COACH_DATA_SCOPES.length),
  primaryProgrammingAuthority: z.boolean().default(true)
});
const relationshipIdSchema = z.object({ relationshipId: z.string().uuid() });
const acceptSchema = z.object({
  acceptedScopes: z.array(scopeSchema).min(1).max(ASCEND_COACH_DATA_SCOPES.length)
});
const scopeChangeSchema = invitationSchema.omit({ clientEmail: true });
const pilotSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional()
});
const breakGlassSchema = z.object({
  clientUserId: z.string().uuid(),
  reason: z.string().trim().min(20).max(500),
  expiresMinutes: z.coerce.number().int().min(5).max(60)
});

function sendCoachError(res: Response, error: unknown) {
  if (!(error instanceof CoachFoundationError)) return false;
  res.status(error.status).json({ error: error.message, code: error.code });
  return true;
}

ascendCoachRouter.post("/coach/relationships/invitations", requireAuth, async (req, res, next) => {
  try {
    const input = invitationSchema.parse(req.body);
    const relationship = await inviteCoachClient({ actor: req.user!, ...input });
    res.status(201).json({ relationship });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.get("/coach/relationships", requireAuth, async (req, res, next) => {
  try {
    res.json({ relationships: await listTrainerCoachRelationships(req.user!) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.patch("/coach/relationships/:relationshipId/scopes", requireAuth, async (req, res, next) => {
  try {
    const { relationshipId } = relationshipIdSchema.parse(req.params);
    const input = scopeChangeSchema.parse(req.body);
    const relationship = await requestCoachScopeChange({ actor: req.user!, relationshipId, ...input });
    res.json({ relationship });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.post("/coach/relationships/:relationshipId/end", requireAuth, async (req, res, next) => {
  try {
    const { relationshipId } = relationshipIdSchema.parse(req.params);
    res.json({ relationship: await endCoachRelationship(req.user!, relationshipId) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.get("/me/coach-access", requireAuth, async (req, res, next) => {
  try {
    res.json(await getMyCoachAccess(req.user!.id));
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.post("/me/coach-access/:relationshipId/accept", requireAuth, async (req, res, next) => {
  try {
    const { relationshipId } = relationshipIdSchema.parse(req.params);
    const input = acceptSchema.parse(req.body);
    res.json({ relationship: await acceptCoachInvitation({ actorUserId: req.user!.id, relationshipId, ...input }) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.post("/me/coach-access/:relationshipId/decline", requireAuth, async (req, res, next) => {
  try {
    const { relationshipId } = relationshipIdSchema.parse(req.params);
    res.json({ relationship: await declineCoachInvitation(req.user!.id, relationshipId) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.post("/me/coach-access/:relationshipId/revoke", requireAuth, async (req, res, next) => {
  try {
    const { relationshipId } = relationshipIdSchema.parse(req.params);
    res.json({ relationship: await revokeCoachRelationship(req.user!.id, relationshipId) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.put("/coach/pilots/:userId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const input = pilotSchema.parse(req.body);
    res.json({ pilot: await grantCoachPilotAccess({ actor: req.user!, userId, ...input }) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.delete("/coach/pilots/:userId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    res.json({ pilot: await revokeCoachPilotAccess(req.user!, userId) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.post("/coach/break-glass", requireAuth, async (req, res, next) => {
  try {
    const input = breakGlassSchema.parse(req.body);
    res.status(201).json({ grant: await grantBreakGlassAccess({ actor: req.user!, ...input }) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});

ascendCoachRouter.delete("/coach/break-glass/:grantId", requireAuth, async (req, res, next) => {
  try {
    const { grantId } = z.object({ grantId: z.string().uuid() }).parse(req.params);
    res.json({ grant: await revokeBreakGlassAccess(req.user!, grantId) });
  } catch (error) {
    if (!sendCoachError(res, error)) next(error);
  }
});
