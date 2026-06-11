import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { createCheckout } from "../services/subscriptionService";
import { paymentProvider } from "../integrations/payments";

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/subscriptions/me", requireAuth, async (req, res) => {
  const result = await query(
    `
    select *
    from subscriptions
    where user_id = $1
    order by
      case when status in ('active', 'trialing') then 0 else 1 end,
      case plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc,
      created_at desc
    limit 1
    `,
    [req.user!.id]
  );
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

subscriptionsRouter.post("/subscriptions/demo-activate", requireAuth, async (req, res, next) => {
  try {
    const plan = z.enum(["premium", "trainer_pro"]).parse(req.body.plan);
    const amountCents = plan === "premium" ? 1900 : 9900;
    const reference = `DEMO-${req.user!.id}-${Date.now()}`;
    const userResult = await query<{ referred_by_gym_id: string | null; referred_by_trainer_id: string | null }>(
      "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
      [req.user!.id]
    );
    const user = userResult.rows[0];

    const result = await query(
      `
      insert into subscriptions (
        user_id, plan, provider, provider_subscription_id, status, amount_cents, currency,
        current_period_start, current_period_end, referred_by_gym_id, referred_by_trainer_id
      )
      values ($1, $2, 'manual', $3, 'active', $4, 'MYR', now(), now() + interval '1 month', $5, $6)
      returning *
      `,
      [req.user!.id, plan, reference, amountCents, user?.referred_by_gym_id ?? null, user?.referred_by_trainer_id ?? null]
    );

    res.status(201).json({ subscription: result.rows[0] });
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

subscriptionsRouter.post("/webhooks/toyyibpay", async (req, res, next) => {
  try {
    const event = await paymentProvider.verifyWebhook(req.body);
    const update =
      event.status === "active"
        ? await query(
            `
            update subscriptions
            set status = 'active',
              updated_at = now(),
              current_period_start = coalesce(current_period_start, now()),
              current_period_end = now() + interval '1 month'
            where provider = 'toyyibpay' and provider_subscription_id = $1
            returning id
            `,
            [event.reference]
          )
        : await query(
            `
            update subscriptions
            set status = $2, updated_at = now()
            where provider = 'toyyibpay' and provider_subscription_id = $1
            returning id
            `,
            [event.reference, event.status]
          );

    await query("insert into payment_events (provider, provider_reference, event_type, payload) values ('toyyibpay', $1, $2, $3)", [
      event.reference,
      event.status,
      req.body
    ]);

    const matchedSubscription = (update.rowCount ?? 0) > 0;
    res.status(matchedSubscription ? 200 : 202).json({ received: true, matchedSubscription });
  } catch (error) {
    next(error);
  }
});
