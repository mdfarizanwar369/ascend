import { pool, query } from "../db/pool";

export async function getConversationSafety(userId: string, otherUserId: string) {
  const result = await query<{ blocked_by_me: boolean; unavailable: boolean }>(`
    select exists (select 1 from message_blocks where blocker_user_id = $1 and blocked_user_id = $2) as blocked_by_me,
      (exists (select 1 from message_blocks where
        (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1))
       or exists (select 1 from message_restrictions where user_id in ($1, $2))) as unavailable
  `, [userId, otherUserId]);
  return { blockedByMe: result.rows[0].blocked_by_me, canSend: !result.rows[0].unavailable };
}

// A single statement checks both directions at the point a message is inserted.
// Both the inbox and trainer shortcut must use this path.
export async function insertSafeMessage(senderId: string, receiverId: string, body: string) {
  const result = await query(`
    insert into messages (sender_user_id, receiver_user_id, body)
    select $1::uuid, $2::uuid, $3::text
    where not exists (select 1 from message_blocks where
      (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1))
      and not exists (select 1 from message_restrictions where user_id in ($1, $2))
    returning *
  `, [senderId, receiverId, body]);
  if (!result.rows[0]) throw Object.assign(new Error("Messaging is unavailable for this conversation."), { status: 403 });
  return result.rows[0];
}

export async function resolveMessageReport(reportId: string, reviewerId: string, action: "remove" | "restrict" | "dismiss") {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ message_id: string; reported_user_id: string }>(
      "select message_id, reported_user_id from message_reports where id = $1 and status = 'open' for update", [reportId]);
    const report = result.rows[0];
    if (!report) throw Object.assign(new Error("Open report not found."), { status: 404 });
    if (action !== "dismiss") {
      await client.query("update messages set body = '[Message removed by Ascend]' where id = $1", [report.message_id]);
    }
    if (action === "restrict") {
      await client.query("insert into message_restrictions (user_id, restricted_by) values ($1, $2) on conflict do nothing", [report.reported_user_id, reviewerId]);
    }
    await client.query("update message_reports set status = $2, resolved_at = now(), resolved_by = $3 where id = $1", [
      reportId, { remove: "removed", restrict: "restricted", dismiss: "dismissed" }[action], reviewerId
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
