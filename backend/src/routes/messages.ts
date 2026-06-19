import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { AuthUser, requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { getAdminGymScope } from "../services/adminScopeService";
import { canManageClient } from "../services/clientAccessService";

export const messagesRouter = Router();

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
        select id, full_name, email, primary_role
        from users
        where id <> $1 and status = 'active'
          and ($2::uuid[] is null or gym_id = any($2))
        order by created_at desc
        limit 100
        `,
        [req.user!.id, scope.gymIds]
      );
      return res.json({ contacts: result.rows });
    }

    if (req.user!.trainerId) {
      const result = await query(
        `
        select id, full_name, email, primary_role
        from users
        where assigned_trainer_id = $1 and status = 'active'
        order by full_name asc
        `,
        [req.user!.trainerId]
      );
      return res.json({ contacts: result.rows });
    }

    const assignedTrainerResult = await query(
      `
      select trainer_user.id, trainer_user.full_name, trainer_user.email, trainer_user.primary_role
      from users client_user
      join trainers t on t.id = client_user.assigned_trainer_id
      join users trainer_user on trainer_user.id = t.user_id and trainer_user.status = 'active'
      where client_user.id = $1 and client_user.status = 'active'
      limit 1
      `,
      [req.user!.id]
    );
    if (assignedTrainerResult.rows.length) return res.json({ contacts: assignedTrainerResult.rows });

    return res.json({ contacts: [] });
  } catch (error) {
    next(error);
  }
});

messagesRouter.get("/trainer/clients/:clientId/messages", requireAuth, requireActivePlan("trainer_pro"), async (req, res, next) => {
  try {
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

    const result = await query(
      "insert into messages (sender_user_id, receiver_user_id, body) values ($1, $2, $3) returning *",
      [req.user!.id, context.client_user_id, input.body]
    );
    res.status(201).json({ message: result.rows[0] });
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

    const result = await query(
      "insert into messages (sender_user_id, receiver_user_id, body) values ($1, $2, $3) returning *",
      [req.user!.id, input.receiverUserId, input.body]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
