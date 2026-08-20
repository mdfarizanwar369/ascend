import { Router } from "express";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { createCheckout } from "../services/subscriptionService";
import { getPaymentProvider, LemonSqueezyProvider, StripeProvider, ToyyibPayProvider } from "../integrations/payments";
import { env } from "../config/env";
import { applyVerifiedGooglePlaySubscription, parseGooglePlayRtdnData, processGooglePlayRtdn, syncGooglePlaySubscriptionForUser, verifyGooglePlaySubscriptionPurchase } from "../services/googlePlayBillingService";

export const subscriptionsRouter = Router();

const googleOidcClient = new OAuth2Client();

function secureTokenMatches(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

subscriptionsRouter.post("/subscriptions/google-play/rtdn", async (req, res, next) => {
  try {
    const verificationToken = env.GOOGLE_PLAY_RTDN_VERIFICATION_TOKEN;
    const expectedAudience = env.GOOGLE_PLAY_RTDN_AUDIENCE;
    const expectedServiceAccount = env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL?.toLowerCase();
    if (!verificationToken || !expectedAudience || !expectedServiceAccount) {
      return res.status(404).json({ error: "Not found" });
    }
    const receivedToken = typeof req.query.token === "string" ? req.query.token : "";
    if (!secureTokenMatches(receivedToken, verificationToken)) {
      return res.status(401).json({ error: "Invalid notification token" });
    }
    const bearer = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return res.status(401).json({ error: "Missing Pub/Sub identity" });
    const ticket = await googleOidcClient.verifyIdToken({ idToken: bearer, audience: expectedAudience });
    const identity = ticket.getPayload();
    if (!identity?.email_verified || identity.email?.toLowerCase() !== expectedServiceAccount) {
      return res.status(401).json({ error: "Invalid Pub/Sub identity" });
    }

    const input = z.object({
      message: z.object({
        messageId: z.string().min(1),
        data: z.string().min(1)
      })
    }).parse(req.body);
    const notification = parseGooglePlayRtdnData(input.message.data);
    const result = await processGooglePlayRtdn(input.message.messageId, notification);
    res.status(result.matchedSubscription || result.test ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.get("/subscriptions/me", requireAuth, async (req, res) => {
  try {
    await syncGooglePlaySubscriptionForUser(req.user!.id);
  } catch {
    // Keep subscription reads resilient even if Google Play cannot be reached.
  }

  const result = await query(
    `
    select *
    from subscriptions
    where user_id = $1
    order by
      case when status in ('active', 'trialing') or (status = 'canceled' and current_period_end > now()) then 0 else 1 end,
      case plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc,
      created_at desc
    limit 1
    `,
    [req.user!.id]
  );
  res.json({ subscription: result.rows[0] ?? { plan: "free", status: "active" } });
});

subscriptionsRouter.post("/subscriptions/google-play/verify", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      purchaseToken: z.string().min(1),
      productId: z.string().min(1).optional(),
      packageName: z.string().min(1).optional(),
    }).parse(req.body);

    const purchase = await verifyGooglePlaySubscriptionPurchase(input);
    const subscription = await applyVerifiedGooglePlaySubscription(req.user!.id, purchase);

    res.status(201).json({
      subscription,
      purchase: {
        plan: purchase.plan,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        status: purchase.status,
        currentPeriodEnd: purchase.currentPeriodEnd,
        acknowledgementState: purchase.acknowledgementState,
        autoRenewEnabled: purchase.autoRenewEnabled,
        latestOrderId: purchase.latestOrderId,
      },
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscriptions/checkout", requireAuth, async (req, res, next) => {
  try {
    const plan = z.enum(["premium", "trainer_pro"]).parse(req.body.plan);
    res.json(await createCheckout(req.user!.id, plan));
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscriptions/demo-activate", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    const plan = z.enum(["premium", "trainer_pro"]).parse(req.body.plan);
    const amountCents = plan === "premium" ? 1999 : 9999;
    const reference = `DEMO-${req.user!.id}-${Date.now()}`;
    const userResult = await query<{ referred_by_gym_id: string | null; referred_by_trainer_id: string | null }>(
      "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
      [req.user!.id]
    );
    const user = userResult.rows[0];

    await query(
      "update subscriptions set status = 'canceled', updated_at = now() where user_id = $1 and status in ('active', 'trialing')",
      [req.user!.id]
    );

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
  const current = await query<{ provider: string }>(
    "select provider from subscriptions where user_id = $1 and status in ('active', 'trialing', 'past_due') order by created_at desc limit 1",
    [req.user!.id]
  );
  if (current.rows[0]?.provider === "lemonsqueezy" || current.rows[0]?.provider === "stripe") {
    return res.status(409).json({ message: "Open the billing portal to cancel or change this subscription." });
  }
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

subscriptionsRouter.get("/subscriptions/billing-portal", requireAuth, async (req, res, next) => {
  try {
    const result = await query<{ provider: string; provider_subscription_id: string | null }>(
      `
      select provider, provider_subscription_id
      from subscriptions
      where user_id = $1
        and (status in ('active', 'trialing', 'past_due') or (status = 'canceled' and current_period_end > now()))
      order by created_at desc
      limit 1
      `,
      [req.user!.id]
    );
    const subscription = result.rows[0];
    if ((subscription?.provider !== "lemonsqueezy" && subscription?.provider !== "stripe") || !subscription.provider_subscription_id) {
      return res.status(404).json({ message: "No billing portal is available for this account." });
    }
    const provider = getPaymentProvider(subscription.provider);
    if (!provider.getCustomerPortalUrl) return res.status(404).json({ message: "No billing portal is available for this account." });
    res.json({ url: await provider.getCustomerPortalUrl(subscription.provider_subscription_id) });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/webhooks/toyyibpay", async (req, res, next) => {
  try {
    if (env.PAYMENT_PROVIDER !== "toyyibpay") {
      return res.status(404).json({ error: "Not found" });
    }
    const event = await new ToyyibPayProvider().verifyWebhook({ payload: req.body });
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

subscriptionsRouter.post("/webhooks/lemonsqueezy", async (req, res, next) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
    const event = await new LemonSqueezyProvider().verifyWebhook({
      payload: req.body,
      rawBody,
      signature: req.header("x-signature") ?? undefined
    });
    let matchedSubscription = false;
    let subscriptionId: string | null = null;
    if (event.subscriptionId && event.userId && event.plan) {
      const updated = await query<{ id: string }>(
        `
        update subscriptions
        set provider_subscription_id = $3,
          provider_customer_id = coalesce($4, provider_customer_id),
          status = $5,
          current_period_start = coalesce($6::timestamptz, current_period_start, now()),
          current_period_end = coalesce($7::timestamptz, current_period_end),
          updated_at = now()
        where id = (
          select id from subscriptions
          where user_id = $1 and provider = 'lemonsqueezy' and plan = $2
          order by created_at desc
          limit 1
        )
        returning id
        `,
        [event.userId, event.plan, event.subscriptionId, event.customerId ?? null, event.status, event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null]
      );

      if (updated.rows[0]) {
        subscriptionId = updated.rows[0].id;
      } else {
        const user = await query<{ referred_by_gym_id: string | null; referred_by_trainer_id: string | null }>(
          "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
          [event.userId]
        );
        if (user.rows[0]) {
          const amountCents = event.plan === "premium" ? 1999 : 9999;
          const inserted = await query<{ id: string }>(
            `
            insert into subscriptions (
              user_id, plan, provider, provider_customer_id, provider_subscription_id, status,
              amount_cents, currency, current_period_start, current_period_end,
              referred_by_gym_id, referred_by_trainer_id
            ) values ($1, $2, 'lemonsqueezy', $3, $4, $5, $6, 'MYR', coalesce($7::timestamptz, now()), $8::timestamptz, $9, $10)
            on conflict (provider, provider_subscription_id) do update set
              status = excluded.status,
              current_period_start = excluded.current_period_start,
              current_period_end = excluded.current_period_end,
              updated_at = now()
            returning id
            `,
            [event.userId, event.plan, event.customerId ?? null, event.subscriptionId, event.status, amountCents,
              event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null,
              user.rows[0].referred_by_gym_id, user.rows[0].referred_by_trainer_id]
          );
          subscriptionId = inserted.rows[0]?.id ?? null;
        }
      }
    } else if (event.subscriptionId) {
      const updated = await query<{ id: string }>(
        `
        update subscriptions
        set status = $2,
          provider_customer_id = coalesce($3, provider_customer_id),
          current_period_start = coalesce($4::timestamptz, current_period_start),
          current_period_end = coalesce($5::timestamptz, current_period_end),
          updated_at = now()
        where provider = 'lemonsqueezy' and provider_subscription_id = $1
        returning id
        `,
        [event.subscriptionId, event.status, event.customerId ?? null, event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null]
      );
      subscriptionId = updated.rows[0]?.id ?? null;
    }

    matchedSubscription = Boolean(subscriptionId);
    if (subscriptionId && (event.status === "active" || event.status === "trialing")) {
      await query(
        `
        update subscriptions
        set status = 'canceled', updated_at = now()
        where user_id = (select user_id from subscriptions where id = $1)
          and id <> $1
          and status in ('active', 'trialing')
        `,
        [subscriptionId]
      );
    }

    await query(
      "insert into payment_events (provider, provider_reference, event_type, payload) values ('lemonsqueezy', $1, $2, $3)",
      [event.reference, event.eventType, event.payload]
    );
    res.status(matchedSubscription ? 200 : 202).json({ received: true, matchedSubscription });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/webhooks/stripe", async (req, res, next) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
    const event = await new StripeProvider().verifyWebhook({
      payload: req.body,
      rawBody,
      signature: req.header("stripe-signature") ?? undefined
    });

    const existing = await query<{ id: string }>(
      "select id from payment_events where provider = 'stripe' and provider_reference = $1 limit 1",
      [event.reference]
    );
    if (existing.rows[0]) return res.json({ received: true, duplicate: true, matchedSubscription: true });

    let subscriptionId: string | null = null;
    if (event.subscriptionId && event.userId && event.plan) {
      const updated = await query<{ id: string }>(
        `
        update subscriptions
        set provider_subscription_id = $3,
          provider_customer_id = coalesce($4, provider_customer_id),
          status = $5,
          current_period_start = coalesce($6::timestamptz, current_period_start, now()),
          current_period_end = coalesce($7::timestamptz, current_period_end),
          updated_at = now()
        where id = (
          select id from subscriptions
          where user_id = $1 and provider = 'stripe' and plan = $2
          order by created_at desc
          limit 1
        )
        returning id
        `,
        [event.userId, event.plan, event.subscriptionId, event.customerId ?? null, event.status,
          event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null]
      );

      subscriptionId = updated.rows[0]?.id ?? null;
      if (!subscriptionId) {
        const user = await query<{ referred_by_gym_id: string | null; referred_by_trainer_id: string | null }>(
          "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
          [event.userId]
        );
        if (user.rows[0]) {
          const amountCents = event.plan === "premium" ? 1999 : 9999;
          const inserted = await query<{ id: string }>(
            `
            insert into subscriptions (
              user_id, plan, provider, provider_customer_id, provider_subscription_id, status,
              amount_cents, currency, current_period_start, current_period_end,
              referred_by_gym_id, referred_by_trainer_id
            ) values ($1, $2, 'stripe', $3, $4, $5, $6, 'MYR', coalesce($7::timestamptz, now()), $8::timestamptz, $9, $10)
            on conflict (provider, provider_subscription_id) do update set
              status = excluded.status,
              provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
              current_period_start = excluded.current_period_start,
              current_period_end = excluded.current_period_end,
              updated_at = now()
            returning id
            `,
            [event.userId, event.plan, event.customerId ?? null, event.subscriptionId, event.status, amountCents,
              event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null,
              user.rows[0].referred_by_gym_id, user.rows[0].referred_by_trainer_id]
          );
          subscriptionId = inserted.rows[0]?.id ?? null;
        }
      }
    } else if (event.subscriptionId) {
      const updated = await query<{ id: string }>(
        `
        update subscriptions
        set status = $2,
          provider_customer_id = coalesce($3, provider_customer_id),
          current_period_start = coalesce($4::timestamptz, current_period_start),
          current_period_end = coalesce($5::timestamptz, current_period_end),
          updated_at = now()
        where provider = 'stripe' and provider_subscription_id = $1
        returning id
        `,
        [event.subscriptionId, event.status, event.customerId ?? null, event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null]
      );
      subscriptionId = updated.rows[0]?.id ?? null;
    }

    if (subscriptionId && (event.status === "active" || event.status === "trialing")) {
      await query(
        `
        update subscriptions
        set status = 'canceled', updated_at = now()
        where user_id = (select user_id from subscriptions where id = $1)
          and id <> $1
          and status in ('active', 'trialing')
        `,
        [subscriptionId]
      );
    }

    await query(
      "insert into payment_events (provider, provider_reference, event_type, payload) values ('stripe', $1, $2, $3)",
      [event.reference, event.eventType, event.payload]
    );
    res.status(subscriptionId ? 200 : 202).json({ received: true, matchedSubscription: Boolean(subscriptionId) });
  } catch (error) {
    next(error);
  }
});
