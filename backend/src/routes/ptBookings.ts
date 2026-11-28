import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { isIosFreeEdition } from "../services/appEdition";
import { changePtBooking, getPtBookingWeek, requestPtBooking, savePtAvailability } from "../services/ptBookingService";

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

const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const availabilitySchema = z.array(z.object({
  weekday: z.int().min(1).max(7),
  opensAt: time,
  closesAt: time
})).max(7).refine((items) => new Set(items.map((item) => item.weekday)).size === items.length, "Choose one window per day.")
  .refine((items) => items.every(({ opensAt, closesAt }) => minutes(closesAt) - minutes(opensAt) >= 60),
    "Each available day needs at least one hour between opening and closing.");

ptBookingsRouter.get("/pt-bookings/:role", requireAuth, bookable, (req, res, next) => {
  const role = roleSchema.safeParse(req.params.role);
  if (!role.success) return res.status(404).json({ error: "This schedule was not found." });
  return access[role.data](req, res, next);
}, async (req, res, next) => {
  try {
    const role = roleSchema.parse(req.params.role);
    const { week, gymId } = z.object({ week: z.iso.date().optional(), gymId: z.uuid().optional() }).parse(req.query);
    res.json(await getPtBookingWeek(req.user!, role, week, gymId));
  } catch (error) { next(error); }
});

ptBookingsRouter.post("/pt-bookings/client/requests", requireAuth, bookable, clientOnly, async (req, res, next) => {
  try {
    const { trainerId, startsAt } = z.object({ trainerId: z.uuid(), startsAt: z.iso.datetime({ offset: true }) }).parse(req.body);
    const id = await requestPtBooking(req.user!, trainerId, startsAt);
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

ptBookingsRouter.put("/pt-bookings/trainer/availability", requireAuth, bookable, trainerOnly, async (req, res, next) => {
  try {
    const { availability } = z.object({ availability: availabilitySchema }).parse(req.body);
    await savePtAvailability(req.user!, availability);
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
    const { action } = z.object({ action: z.enum(["confirm", "decline", "cancel"]) }).parse(req.body);
    if (role === "client" && action !== "cancel") return res.status(403).json({ error: "Your trainer handles booking approvals." });
    await changePtBooking(req.user!, role, id, action);
    res.json({ saved: true });
  } catch (error) { next(error); }
});
