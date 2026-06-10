import { PLANS, SubscriptionPlan } from "@ascend/shared";
import { query } from "../db/pool";
import { paymentProvider } from "../integrations/payments";

export async function createCheckout(userId: string, plan: SubscriptionPlan) {
  if (plan === "free") throw new Error("Free plan does not require checkout");
  const userResult = await query<{
    id: string;
    email: string;
    full_name: string;
    referred_by_gym_id: string | null;
    referred_by_trainer_id: string | null;
  }>("select id, email, full_name, referred_by_gym_id, referred_by_trainer_id from users where id = $1", [userId]);
  const user = userResult.rows[0];
  const amountRm = PLANS[plan].priceRm;
  const session = await paymentProvider.createCheckoutSession({
    userId,
    email: user.email,
    fullName: user.full_name,
    plan,
    amountRm
  });

  await query(
    `
    insert into subscriptions (
      user_id, plan, provider, provider_subscription_id, status, amount_cents, currency,
      referred_by_gym_id, referred_by_trainer_id
    )
    values ($1, $2, 'toyyibpay', $3, 'past_due', $4, 'MYR', $5, $6)
    on conflict (provider, provider_subscription_id) do nothing
    `,
    [
      userId,
      plan,
      session.providerReference,
      amountRm * 100,
      user.referred_by_gym_id,
      user.referred_by_trainer_id
    ]
  );

  return session;
}

