import { PoolClient } from "pg";
import { SubscriptionPlan } from "@ascend/shared";
import { pool } from "../db/pool";

export type EntitlementProvider = "stripe" | "google_play" | "manual" | "promotional" | "lemonsqueezy" | "toyyibpay";
export type EntitlementStatus = "pending" | "active" | "trial" | "grace_period" | "on_hold" | "paused" | "canceled" | "expired" | "revoked" | "refunded" | "unknown";

export type EffectiveEntitlement = {
  premium: boolean;
  plan: SubscriptionPlan;
  provider: EntitlementProvider | null;
  status: EntitlementStatus | "free";
  startTime: string | null;
  expiryTime: string | null;
  autoRenewEnabled: boolean;
  lastVerifiedAt: string | null;
  stale: boolean;
  managementType: "none" | "web_portal" | "google_play" | "manual";
  managementUrl: string | null;
  sourceCount: number;
};

const planRank: Record<SubscriptionPlan, number> = { free: 0, premium: 1, trainer_pro: 2 };

export function entitlementGrantsAccess(status: string, expiry: string | null, now = Date.now()) {
  const unexpired = !expiry || new Date(expiry).getTime() > now;
  if (["active", "trial", "grace_period", "trialing"].includes(status)) return unexpired;
  return status === "canceled" && Boolean(expiry && unexpired);
}

export async function getEffectiveEntitlement(userId: string): Promise<EffectiveEntitlement> {
  const result = await pool.query<{
    plan: SubscriptionPlan;
    provider: EntitlementProvider;
    status: string;
    started_at: string | null;
    expires_at: string | null;
    auto_renew_enabled: boolean;
    last_verified_at: string | null;
    stale_after: string | null;
    management_type: EffectiveEntitlement["managementType"];
    management_url: string | null;
  }>(
    `
    with sources as (
      select plan, provider::text as provider, status, started_at, expires_at,
             auto_renew_enabled, last_verified_at, stale_after, management_type, management_url,
             updated_at
      from subscription_entitlements
      where user_id = $1
      union all
      select plan, provider::text, status::text, current_period_start, current_period_end,
             status in ('active', 'trialing'), updated_at, updated_at + interval '24 hours',
             case when provider in ('stripe', 'lemonsqueezy') then 'web_portal' else
               case when provider = 'google_play' then 'google_play' else 'manual' end
             end,
             null, updated_at
      from subscriptions s
      where user_id = $1
        and not exists (
          select 1 from subscription_entitlements e
          where e.user_id = s.user_id
            and e.provider = s.provider::text
            and (
              e.idempotency_key = 'legacy-subscription:' || s.id::text
              or (s.provider_subscription_id is not null and e.provider_subscription_ref = s.provider_subscription_id)
            )
        )
    )
    select plan, provider, status, started_at, expires_at, auto_renew_enabled,
           last_verified_at, stale_after, management_type, management_url
    from sources
    order by
      case when status in ('active', 'trial', 'trialing', 'grace_period')
             or (status = 'canceled' and expires_at > now()) then 0 else 1 end,
      case plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc,
      expires_at desc nulls first,
      updated_at desc
    `,
    [userId]
  );

  const active = result.rows.filter((row) => entitlementGrantsAccess(row.status, row.expires_at));
  active.sort((a, b) => planRank[b.plan] - planRank[a.plan]);
  const selected = active[0] ?? result.rows[0];
  if (!selected || active.length === 0) {
    return {
      premium: false, plan: "free", provider: selected?.provider ?? null,
      status: (selected?.status as EffectiveEntitlement["status"]) ?? "free",
      startTime: selected?.started_at ?? null, expiryTime: selected?.expires_at ?? null,
      autoRenewEnabled: selected?.auto_renew_enabled ?? false,
      lastVerifiedAt: selected?.last_verified_at ?? null,
      stale: Boolean(selected?.stale_after && new Date(selected.stale_after).getTime() < Date.now()),
      managementType: selected?.management_type ?? "none",
      managementUrl: selected?.management_url ?? null,
      sourceCount: active.length,
    };
  }

  return {
    premium: true,
    plan: selected.plan,
    provider: selected.provider,
    status: selected.status as EffectiveEntitlement["status"],
    startTime: selected.started_at,
    expiryTime: selected.expires_at,
    autoRenewEnabled: selected.auto_renew_enabled,
    lastVerifiedAt: selected.last_verified_at,
    stale: Boolean(selected.stale_after && new Date(selected.stale_after).getTime() < Date.now()),
    managementType: selected.management_type,
    managementUrl: selected.management_url,
    sourceCount: active.length,
  };
}

export async function withBillingTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
