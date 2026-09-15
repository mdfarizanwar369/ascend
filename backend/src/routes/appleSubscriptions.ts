import { Router, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { APPLE_PRODUCTS, appleBillingAvailableForUser, appleRequestError, hasOtherPaidSubscription, processAppleNotification, verifyApplePurchase } from "../services/appleSubscriptionService";

export const appleSubscriptionsRouter = Router();
function handleAppleError(error: unknown, res: Response, next: NextFunction) {
  const mapped = appleRequestError(error);
  if (mapped instanceof Error && (mapped as Error & { status?: number }).status === 503) {
    return res.status(503).json({ error: mapped.message });
  }
  next(mapped);
}
appleSubscriptionsRouter.get("/subscriptions/apple/config", requireAuth, async (req, res, next) => {
  try {
    const enabled = appleBillingAvailableForUser(req.user!.id);
    res.json({ enabled, purchaseBlocked: enabled && await hasOtherPaidSubscription(req.user!.id), appAccountToken: req.user!.id, productIds: Object.keys(APPLE_PRODUCTS) });
  } catch (error) { next(error); }
});
appleSubscriptionsRouter.post("/subscriptions/apple/verify", requireAuth, rateLimit({ windowMs: 60_000, limit: 30 }), async (req, res, next) => {
  try {
    const input = z.object({ signedTransaction: z.string().min(1).max(64_000), environment: z.enum(["Production", "Sandbox"]).optional() }).parse(req.body);
    res.json({ subscription: await verifyApplePurchase(req.user!.id, input.signedTransaction, input.environment) });
  } catch (error) { handleAppleError(error, res, next); }
});
appleSubscriptionsRouter.post("/webhooks/apple", async (req, res, next) => {
  try {
    const input = z.object({ signedPayload: z.string().min(1).max(128_000) }).parse(req.body);
    res.json(await processAppleNotification(input.signedPayload));
  } catch (error) { handleAppleError(error, res, next); }
});
