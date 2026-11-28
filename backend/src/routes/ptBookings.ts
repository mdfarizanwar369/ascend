import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { isAscendNativeUserAgent, ptSessionFeelings, ptSessionPreferences } from "@ascend/shared";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { isIosFreeEdition, isIosNativeRequest } from "../services/appEdition";
import {
  addPtCalendarBlock, bookPtForClient, changePtBooking, dismissPtBookingUpdate, getPtBookingWeek,
  getTrainerPtOpenings, removePtCalendarBlock, requestPtBooking, savePtSessionWellbeing
} from "../services/ptBookingService";
import { notifyPtBookingClient } from "../services/ptBookingPushService";

export const ptBookingsRouter = Router();

const roleSchema = z.enum(["client", "trainer", "manager"]);
const bookable: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (!env.PT_BOOKING_V1 || isIosFreeEdition()) {
    res.status(404).json({ error: "PT booking is currently unavailable." });
    return;
  }
  next();
};
const clientOnly = requireRole(["client"]);
const trainerOnly = requireRole(["trainer"]);
const managerOnly = requireRole(["admin", "owner"]);
const access = { client: clientOnly, trainer: trainerOnly, manager: managerOnly };

function canUseWellbeingPilot(req: Request) {
  return env.PT_SESSION_WELLBEING_V1 && !isIosNativeRequest(req) && !isAscendNativeUserAgent(req.get("User-Agent") ?? "");
}

const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
const blockSchema = z.object({
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  startsAt: time.nullable(),
  endsAt: time.nullable(),
  repeat: z.enum(["none", "daily", "weekly"])
}).refine(({ startsOn, endsOn, repeat }) => endsOn >= startsOn && (repeat === "none" || startsOn === endsOn),
  "Choose a valid date range. Repeating blocks start on one day.")
  .refine(({ startsOn, endsOn, startsAt, endsAt }) => (startsAt === null && endsAt === null)
    || (startsAt !== null && endsAt !== null && startsOn === endsOn && startsAt < endsAt),
  "Choose a start time before the end time on the same day.");

ptBookingsRouter.get("/pt-bookings/:role", requireAuth, bookable, (req, res, next) => {
  const role = roleSchema.safeParse(req.params.role);
  if (!role.success) return res.status(404).json({ error: "This schedule was not found." });
  return access[role.data](req, res, next);
}, async (req, res, next) => {
  try {
    const role = roleSchema.parse(req.params.role);
    const { week, gymId } = z.object({ week: z.iso.date().optional(), gymId: z.uuid().optional() }).parse(req.query);
    res.json(await getPtBookingWeek(req.user!, role, week, gymId, canUseWellbeingPilot(req)));
  } catch (error) { next(error); }
});

ptBookingsRouter.post("/pt-bookings/client/requests", requireAuth, bookable, clientOnly, async (req, res, next) => {
  try {
    const { trainerId, startsAt } = z.object({ trainerId: z.uuid(), startsAt: z.iso.datetime({ offset: true }) }).parse(req.body);
    const id = await requestPtBooking(req.user!, trainerId, startsAt);
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

const wellbeingSchema = z.strictObject({
  version: z.int().positive(),
  wellbeing: z.strictObject({
    feeling: z.enum(ptSessionFeelings).nullable(),
    preference: z.enum(ptSessionPreferences).nullable()
  }).refine(({ feeling, preference }) => Boolean(feeling || preference), "Choose something to share.").nullable()
});

ptBookingsRouter.put("/pt-bookings/client/requests/:id/wellbeing", requireAuth, bookable, clientOnly, async (req, res, next) => {
  try {
    if (!canUseWellbeingPilot(req)) return res.status(404).json({ error: "Session check-ins are unavailable." });
    const id = z.uuid().parse(req.params.id);
    const { version, wellbeing } = wellbeingSchema.parse(req.body);
    await savePtSessionWellbeing(req.user!, id, version, wellbeing);
    res.json({ saved: true });
  } catch (error) { next(error); }
});

ptBookingsRouter.post("/pt-bookings/trainer/blocks", requireAuth, bookable, trainerOnly, async (req, res, next) => {
  try {
    res.status(201).json(await addPtCalendarBlock(req.user!, blockSchema.parse(req.body)));
  } catch (error) { next(error); }
});

ptBookingsRouter.delete("/pt-bookings/trainer/blocks/:id", requireAuth, bookable, trainerOnly, async (req, res, next) => {
  try {
    await removePtCalendarBlock(req.user!, z.uuid().parse(req.params.id));
    res.json({ saved: true });
  } catch (error) { next(error); }
});

ptBookingsRouter.get("/pt-bookings/trainer/clients/:clientId/openings", requireAuth, bookable, trainerOnly, async (req, res, next) => {
  try {
    const clientId = z.uuid().parse(req.params.clientId);
    const { week, bookingId } = z.object({ week: z.iso.date().optional(), bookingId: z.uuid().optional() }).parse(req.query);
    res.json(await getTrainerPtOpenings(req.user!, clientId, week, bookingId));
  } catch (error) { next(error); }
});

ptBookingsRouter.post("/pt-bookings/trainer/clients/:clientId/bookings", requireAuth, bookable, trainerOnly, async (req, res, next) => {
  try {
    const clientId = z.uuid().parse(req.params.clientId);
    const { startsAt, move } = z.object({
      startsAt: z.iso.datetime({ offset: true }),
      move: z.object({ id: z.uuid(), version: z.int().positive() }).optional()
    }).parse(req.body);
    const { id, notice } = await bookPtForClient(req.user!, clientId, startsAt, move);
    notifyPtBookingClient(notice);
    res.status(move ? 200 : 201).json({ id });
  } catch (error) { next(error); }
});

ptBookingsRouter.patch("/pt-bookings/client/updates/:id", requireAuth, bookable, clientOnly, async (req, res, next) => {
  try {
    await dismissPtBookingUpdate(req.user!.id, z.uuid().parse(req.params.id));
    res.json({ saved: true });
  } catch (error) { next(error); }
});

ptBookingsRouter.patch("/pt-bookings/:role/requests/:id", requireAuth, bookable, (req, res, next) => {
  const role = req.params.role;
  if (role === "client" || role === "trainer") return access[role](req, res, next);
  return res.status(404).json({ error: "This action was not found." });
}, async (req, res, next) => {
  try {
    const role = z.enum(["client", "trainer"]).parse(req.params.role);
    const id = z.uuid().parse(req.params.id);
    const { action, version } = z.object({ action: z.enum(["confirm", "decline", "cancel"]), version: z.int().positive().optional() }).parse(req.body);
    if (role === "client" && action !== "cancel") return res.status(403).json({ error: "Your trainer handles booking approvals." });
    notifyPtBookingClient(await changePtBooking(req.user!, role, id, action, version));
    res.json({ saved: true });
  } catch (error) { next(error); }
});
