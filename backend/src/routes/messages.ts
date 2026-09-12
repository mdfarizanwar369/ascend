import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { AuthUser, requireAuth, requirePlatformOwner } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { getAdminGymScope } from "../services/adminScopeService";
import { canManageClient } from "../services/clientAccessService";
import { withProfilePhotoUrls } from "../services/profilePhotoService";
import { notifyHumanCoachEvent } from "../services/notificationService";
import { getConversationSafety, insertSafeMessage, resolveMessageReport } from "../services/messageSafetyService";

export const messagesRouter = Router();

const trainerThreadQuerySchema = z.object({
  markRead: z.enum(["true", "false"]).default("true").transform((value) => value === "true")
});

const messageSchema = z.object({
  receiverUserId: z.string().uuid(),
  body: z.string().min(1).max(4000)
});

const trainerClientMessageSchema = z.object({
  body: z.string().min(1).max(4000)
});

async function canMessageUser(currentUser: AuthUser, otherUserId: string) {
  if (currentUser.roles.includes("admin") || currentUser.roles.includes("owner")) {
    const other = await query<{ gym_id: string | null }>("select gym_id from users where id = $1 and status = 'active'", [otherUserId]);
    const scope = await getAdminGymScope(currentUser);
    return scope.gymIds === null || Boolean(other.rows[0]?.gym_id && scope.gymIds.includes(other.rows[0].gym_id));
  }

  if (currentUser.trainerId) {
    const clientResult = await query(
      "select id from users where id = $1 and assigned_trainer_id = $2 and status = 'active' limit 1",
      [otherUserId, currentUser.trainerId]
    );
    return Boolean(clientResult.rows[0]);
  }

  const assignedTrainerResult = await query(
    `
    select trainer_user.id
    from users cu
    join trainers t on t.id = cu.assigned_trainer_id
    join users trainer_user on trainer_user.id = t.user_id and trainer_user.status = 'active'
    where cu.id = $1 and cu.status = 'active' and trainer_user.id = $2
    limit 1
    `,
    [currentUser.id, otherUserId]
  );
  if (assignedTrainerResult.rows[0]) return true;

  return false;
}

async function getTrainerClientThreadContext(clientId: string, currentUser: AuthUser) {
  if (!await canManageClient(currentUser, clientId)) return null;
  const result = await query<{
    client_user_id: string;
    trainer_id: string | null;
    trainer_user_id: string | null;
  }>(
    `
    select client_user.id as client_user_id, t.id as trainer_id, trainer_user.id as trainer_user_id
    from users client_user
    left join trainers t on t.id = client_user.assigned_trainer_id
    left join users trainer_user on trainer_user.id = t.user_id
    where client_user.id = $1
      and client_user.status = 'active'
      and (
        client_user.assigned_trainer_id = $2
        or $3 = any($4::text[])
        or $5 = any($4::text[])
      )
    limit 1
    `,
    [clientId, currentUser.trainerId ?? null, "admin", currentUser.roles, "owner"]
  );

  return result.rows[0] ?? null;
}

messagesRouter.get("/messages/contacts", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    if (req.user!.roles.includes("admin") || req.user!.roles.includes("owner")) {
      const scope = await getAdminGymScope(req.user!);
      const result = await query(
        `
        select u.id, u.full_name, u.email, u.primary_role, u.profile_photo_s3_key,
          coalesce(thread.unread_count, 0) as unread_count,
          thread.last_message_at
        from users u
        left join lateral (
          select
            count(*) filter (where sender_user_id = u.id and receiver_user_id = $1 and read_at is null) as unread_count,
            max(created_at) as last_message_at
          from messages
          where (sender_user_id = u.id and receiver_user_id = $1)
             or (sender_user_id = $1 and receiver_user_id = u.id)
        ) thread on true
        where u.id <> $1 and u.status = 'active'
          and ($2::uuid[] is null or u.gym_id = any($2))
        order by coalesce(thread.unread_count, 0) desc, thread.last_message_at desc nulls last, u.full_name asc
        limit 100
        `,
        [req.user!.id, scope.gymIds]
      );
      return res.json({ contacts: await withProfilePhotoUrls(result.rows) });
    }

    if (req.user!.trainerId) {
      const result = await query(
        `
        select u.id, u.full_name, u.email, u.primary_role, u.profile_photo_s3_key,
          coalesce(thread.unread_count, 0) as unread_count,
          thread.last_message_at
        from users u
        left join lateral (
          select
            count(*) filter (where sender_user_id = u.id and receiver_user_id = $2 and read_at is null) as unread_count,
            max(created_at) as last_message_at
          from messages
          where (sender_user_id = u.id and receiver_user_id = $2)
             or (sender_user_id = $2 and receiver_user_id = u.id)
        ) thread on true
        where u.assigned_trainer_id = $1 and u.status = 'active'
        order by coalesce(thread.unread_count, 0) desc, thread.last_message_at desc nulls last, u.full_name asc
        `,
        [req.user!.trainerId, req.user!.id]
      );
      return res.json({ contacts: await withProfilePhotoUrls(result.rows) });
    }

    const assignedTrainerResult = await query(
      `
      select trainer_user.id, trainer_user.full_name, trainer_user.email, trainer_user.primary_role, trainer_user.profile_photo_s3_key,
        coalesce(thread.unread_count, 0) as unread_count,
        thread.last_message_at
      from users client_user
      join trainers t on t.id = client_user.assigned_trainer_id
      join users trainer_user on trainer_user.id = t.user_id and trainer_user.status = 'active'
      left join lateral (
        select
          count(*) filter (where sender_user_id = trainer_user.id and receiver_user_id = $1 and read_at is null) as unread_count,
          max(created_at) as last_message_at
        from messages
        where (sender_user_id = trainer_user.id and receiver_user_id = $1)
           or (sender_user_id = $1 and receiver_user_id = trainer_user.id)
      ) thread on true
      where client_user.id = $1 and client_user.status = 'active'
      limit 1
      `,
      [req.user!.id]
    );
    if (assignedTrainerResult.rows.length) return res.json({ contacts: await withProfilePhotoUrls(assignedTrainerResult.rows) });

    return res.json({ contacts: [] });
  } catch (error) {
    next(error);
  }
});

messagesRouter.get("/trainer/clients/:clientId/messages", requireAuth, requireActivePlan("trainer_pro"), async (req, res, next) => {
  try {
    const { markRead } = trainerThreadQuerySchema.parse(req.query);
    const context = await getTrainerClientThreadContext(req.params.clientId, req.user!);
    if (!context) return res.status(404).json({ error: "Client not found" });

    const participantIds = [context.client_user_id, req.user!.id];
    if (context.trainer_user_id) participantIds.push(context.trainer_user_id);

    const result = await query(
      `
      select *
      from messages
      where sender_user_id = any($1::uuid[])
        and receiver_user_id = any($1::uuid[])
        and (sender_user_id = $2 or receiver_user_id = $2)
      order by created_at desc
      limit 100
      `,
      [participantIds, context.client_user_id]
    );

    if (markRead) {
      await query(
        `
        update messages
        set read_at = now()
        where receiver_user_id = $1
          and sender_user_id = $2
          and read_at is null
        `,
        [req.user!.id, context.client_user_id]
      );
    }

    res.json({ messages: result.rows.reverse() });
  } catch (error) {
    next(error);
  }
});

messagesRouter.post("/trainer/clients/:clientId/messages", requireAuth, requireActivePlan("trainer_pro"), async (req, res, next) => {
  try {
    const input = trainerClientMessageSchema.parse(req.body);
    const context = await getTrainerClientThreadContext(req.params.clientId, req.user!);
    if (!context) return res.status(404).json({ error: "Client not found" });

    const message = await insertSafeMessage(req.user!.id, context.client_user_id, input.body);
    await notifyHumanCoachEvent({ userId: context.client_user_id, event: "message", senderName: req.user!.email });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

messagesRouter.get("/messages/:userId", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = z.string().uuid().parse(req.params.userId);
    const allowed = await canMessageUser(req.user!, input);
    if (!allowed) return res.status(403).json({ error: "You cannot message this user" });

    const result = await query(
      `
      select *
      from messages
      where (sender_user_id = $1 and receiver_user_id = $2)
         or (sender_user_id = $2 and receiver_user_id = $1)
      order by created_at desc
      limit 100
      `,
      [req.user!.id, input]
    );

    await query("update messages set read_at = now() where sender_user_id = $1 and receiver_user_id = $2 and read_at is null", [
      input,
      req.user!.id
    ]);

    res.json({ messages: result.rows.reverse() });
  } catch (error) {
    next(error);
  }
});

messagesRouter.post("/messages", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = messageSchema.parse(req.body);
    const allowed = await canMessageUser(req.user!, input.receiverUserId);
    if (!allowed) return res.status(403).json({ error: "You cannot message this user" });

    const message = await insertSafeMessage(req.user!.id, input.receiverUserId, input.body);
    await notifyHumanCoachEvent({ userId: input.receiverUserId, event: "message", senderName: req.user!.email });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

async function canAccessSafety(user: AuthUser, otherId: string) {
  if (user.id === otherId) return false;
  const history = await query(`select 1 from messages where
    (sender_user_id = $1 and receiver_user_id = $2) or (sender_user_id = $2 and receiver_user_id = $1)
    union all select 1 from message_blocks where blocker_user_id = $1 and blocked_user_id = $2
    limit 1`, [user.id, otherId]);
  return Boolean(history.rows[0]) || await canMessageUser(user, otherId);
}

// Safety actions remain available without a paid subscription, including old conversations.
messagesRouter.get("/messages/contacts/:userId/safety", requireAuth, async (req, res, next) => {
  try {
    const otherId = z.string().uuid().parse(req.params.userId);
    if (!await canAccessSafety(req.user!, otherId)) return res.status(404).json({ error: "Conversation not found" });
    res.json(await getConversationSafety(req.user!.id, otherId));
  } catch (error) { next(error); }
});

messagesRouter.put("/messages/contacts/:userId/block", requireAuth, async (req, res, next) => {
  try {
    const otherId = z.string().uuid().parse(req.params.userId);
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    if (!await canAccessSafety(req.user!, otherId)) return res.status(404).json({ error: "Conversation not found" });
    if (blocked) {
      await query("insert into message_blocks (blocker_user_id, blocked_user_id) values ($1, $2) on conflict do nothing", [req.user!.id, otherId]);
    } else {
      await query("delete from message_blocks where blocker_user_id = $1 and blocked_user_id = $2", [req.user!.id, otherId]);
    }
    res.json(await getConversationSafety(req.user!.id, otherId));
  } catch (error) { next(error); }
});

messagesRouter.post("/messages/:messageId/report", requireAuth, async (req, res, next) => {
  try {
    const messageId = z.string().uuid().parse(req.params.messageId);
    const input = z.object({ reason: z.enum(["harassment", "inappropriate", "spam", "other"]), details: z.string().trim().max(2000).default("") }).parse(req.body);
    const result = await query(`insert into message_reports
      (message_id, reporter_user_id, reported_user_id, message_body, reason, details)
      select id, $2, sender_user_id, body, $3, $4 from messages where id = $1 and receiver_user_id = $2 and sender_user_id <> $2
      on conflict (message_id, reporter_user_id) do update set message_id = excluded.message_id
      returning id`, [messageId, req.user!.id, input.reason, input.details]);
    if (!result.rows[0]) return res.status(404).json({ error: "Received message not found" });
    res.status(201).json({ report: result.rows[0] });
  } catch (error) { next(error); }
});

// Only the platform moderation team can read private reports, never a reported coach or gym owner.
messagesRouter.get("/moderation/messages", requireAuth, requirePlatformOwner, async (_req, res, next) => {
  try {
    const result = await query(`select r.*, sender.full_name as sender_name, reporter.full_name as reporter_name
      from message_reports r join users sender on sender.id = r.reported_user_id
      join users reporter on reporter.id = r.reporter_user_id
      order by (r.status = 'open') desc, r.created_at asc limit 200`);
    res.json({ reports: result.rows });
  } catch (error) { next(error); }
});

messagesRouter.post("/moderation/messages/:reportId/resolve", requireAuth, requirePlatformOwner, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.reportId);
    const { action } = z.object({ action: z.enum(["remove", "restrict", "dismiss"]) }).parse(req.body);
    await resolveMessageReport(id, req.user!.id, action);
    res.json({ resolved: true });
  } catch (error) { next(error); }
});
