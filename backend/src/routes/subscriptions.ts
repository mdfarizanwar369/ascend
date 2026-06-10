import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { createCheckout } from "../services/subscriptionService";
import { paymentProvider } from "../integrations/payments";

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/subscriptions/me", requireAuth, async (req, res) => {
  const result = await query("select * from subscriptions where user_id = $1 order by created_at desc limit 1", [req.user!.id]);
  res.json({ subscription: result.rows[0] ?? { plan: "free", status: "active" } });
});

subscriptionsRouter.post("/subscriptions/checkout", requireAuth, async (req, res, next) => {
  try {
    const plan = z.enum(["premium", "trainer_pro"]).parse(req.body.plan);
    res.json(await createCheckout(req.user!.id, plan));
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscriptions/cancel", requireAuth, async (req, res) => {
  const result = await query(
    `
    update subscriptions
    set status = 'canceled', updated_at = now()
    where user_id = $1 and status in ('active', 'trialing', 'past_due')
    returning *
    `,
    [req.user!.id]
  );
  res.json({ subscription: result.rows[0] ?? null });
});

subscriptionsRouter.post("/webhooks/toyyibpay", async (req, res) => {
  const event = await paymentProvider.verifyWebhook(req.body);
  await query(
    "update subscriptions set status = $2, updated_at = now(), current_period_start = now(), current_period_end = now() + interval '1 month' where provider_subscription_id = $1",
    [event.reference, event.status]
  );
  await query("insert into payment_events (provider, provider_reference, event_type, payload) values ('toyyibpay', $1, $2, $3)", [
    event.reference,
    event.status,
    req.body
  ]);
  res.json({ received: true });
});
