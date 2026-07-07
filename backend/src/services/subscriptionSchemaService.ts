import { query } from "../db/pool";

export async function ensureSubscriptionSchema() {
  await query("alter type subscription_provider add value if not exists 'lemonsqueezy'");
  await query("alter type subscription_provider add value if not exists 'stripe'");
  await query("alter type subscription_provider add value if not exists 'google_play'");
}
