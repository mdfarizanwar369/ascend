import { pool } from "../db/pool";

export const TRAINER_CONNECTION_CONSENT_VERSION = "trainer-connection-v1";

export async function previewTrainerConnection(code: string) {
  const result = await pool.query<{
    referral_code_id: string;
    trainer_id: string;
    trainer_name: string;
    workspace_name: string;
    workspace_type: string;
  }>(`
    select rc.id as referral_code_id, t.id as trainer_id, u.full_name as trainer_name,
      g.name as workspace_name, g.workspace_type
    from referral_codes rc
    join trainers t on t.id=rc.trainer_id and t.status='active'
    join users u on u.id=t.user_id and u.status='active'
    join gyms g on g.id=t.gym_id
    where rc.code=$1 and rc.type='trainer' and rc.active=true
  `, [code.trim().toUpperCase()]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    code: code.trim().toUpperCase(),
    trainerId: row.trainer_id,
    trainerName: row.trainer_name,
    workspaceName: row.workspace_name,
    workspaceType: row.workspace_type,
    consentVersion: TRAINER_CONNECTION_CONSENT_VERSION,
    sharedCategories: ["activity", "meals", "weight and progress", "messages", "plans", "enabled coaching records"]
  };
}

export async function connectClientToTrainer(userId: string, code: string, consentVersion: string) {
  if (consentVersion !== TRAINER_CONNECTION_CONSENT_VERSION) {
    throw Object.assign(new Error("Review and accept the current trainer connection disclosure."), { status: 400 });
  }
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`trainer-connection:${code.trim().toUpperCase()}`]);
    const referral = await db.query<{
      referral_code_id: string;
      trainer_id: string;
      trainer_user_id: string;
      trainer_name: string;
      gym_id: string;
      workspace_name: string;
      subscription_status: string;
      introductory_trial: boolean;
    }>(`
      select rc.id as referral_code_id, t.id as trainer_id, t.user_id as trainer_user_id,
        trainer_user.full_name as trainer_name, t.gym_id, g.name as workspace_name,
        coalesce(s.status::text,'expired') as subscription_status,
        coalesce(s.apple_offer_type=1 and s.amount_cents=0, false) as introductory_trial
      from referral_codes rc
      join trainers t on t.id=rc.trainer_id and t.status='active'
      join users trainer_user on trainer_user.id=t.user_id and trainer_user.status='active'
      join gyms g on g.id=t.gym_id
      left join lateral (
        select status, apple_offer_type, amount_cents from subscriptions
        where user_id=t.user_id and plan='trainer_pro'
          and (status in ('active','trialing') or (status='canceled' and current_period_end > now()))
        order by created_at desc limit 1
      ) s on true
      where rc.code=$1 and rc.type='trainer' and rc.active=true
      for update of rc, t
    `, [code.trim().toUpperCase()]);
    const trainer = referral.rows[0];
    if (!trainer) throw Object.assign(new Error("Trainer referral code not found."), { status: 404 });
    if (!['active', 'trialing', 'canceled'].includes(trainer.subscription_status)) {
      throw Object.assign(new Error("This trainer does not currently have active Trainer Pro access."), { status: 409 });
    }
    if (trainer.trainer_user_id === userId) throw Object.assign(new Error("A trainer cannot connect themselves as a client."), { status: 400 });

    const client = await db.query<{ assigned_trainer_id: string | null }>(
      "select assigned_trainer_id from users where id=$1 and status='active' for update",
      [userId]
    );
    if (!client.rows[0]) throw Object.assign(new Error("Ascend account not found."), { status: 404 });

    const cap = trainer.subscription_status === "trialing" || trainer.introductory_trial ? 2 : 5;
    const clientCount = await db.query<{ count: string }>(
      "select count(*)::text as count from users where assigned_trainer_id=$1 and status='active' and id<>$2",
      [trainer.trainer_id, userId]
    );
    if (Number(clientCount.rows[0]?.count ?? 0) >= cap && client.rows[0].assigned_trainer_id !== trainer.trainer_id) {
      throw Object.assign(new Error(`This trainer has reached the ${cap}-client limit for their current plan.`), { status: 409 });
    }

    await db.query(`
      update client_trainer_connections
      set disconnected_at=now(), disconnected_by_user_id=$1, disconnect_reason='reassigned'
      where client_user_id=$1 and disconnected_at is null and trainer_id<>$2
    `, [userId, trainer.trainer_id]);
    await db.query(`
      insert into client_trainer_connections
        (client_user_id, trainer_id, referral_code_id, consent_policy_version, consented_at)
      values ($1,$2,$3,$4,now())
      on conflict (client_user_id) where disconnected_at is null do nothing
    `, [userId, trainer.trainer_id, trainer.referral_code_id, consentVersion]);
    await db.query(`
      update users set assigned_trainer_id=$2, gym_id=$3, referred_by_trainer_id=$2,
        referred_by_gym_id=$3, coaching_mode='human_coach', updated_at=now()
      where id=$1
    `, [userId, trainer.trainer_id, trainer.gym_id]);
    await db.query("commit");
    return { trainerId: trainer.trainer_id, trainerName: trainer.trainer_name, workspaceName: trainer.workspace_name };
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally { db.release(); }
}

export async function disconnectClientFromTrainer(userId: string) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query(`
      update client_trainer_connections
      set disconnected_at=now(), disconnected_by_user_id=$1, disconnect_reason='client_request'
      where client_user_id=$1 and disconnected_at is null
    `, [userId]);
    const result = await db.query(`
      update users set assigned_trainer_id=null, coaching_mode='self_coached', updated_at=now()
      where id=$1 returning id
    `, [userId]);
    await db.query("commit");
    return Boolean(result.rows[0]);
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally { db.release(); }
}
