import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const messagesRouter = Router();

const messageSchema = z.object({
  receiverUserId: z.string().uuid(),
  body: z.string().min(1).max(4000)
});

async function canMessageUser(currentUserId: string, currentTrainerId: string | undefined, roles: string[], otherUserId: string) {
  if (roles.includes("admin") || roles.includes("owner")) return true;

  if (currentTrainerId) {
    const clientResult = await query("select id from users where id = $1 and assigned_trainer_id = $2 limit 1", [otherUserId, currentTrainerId]);
    return Boolean(clientResult.rows[0]);
  }

  const trainerResult = await query(
    `
    select trainer_user.id
    from users current_user
    join trainers t on t.id = current_user.assigned_trainer_id
    join users trainer_user on trainer_user.id = t.user_id
    where current_user.id = $1 and trainer_user.id = $2
    limit 1
    `,
    [currentUserId, otherUserId]
  );
  return Boolean(trainerResult.rows[0]);
}

messagesRouter.get("/messages/contacts", requireAuth, async (req, res) => {
  if (req.user!.roles.includes("admin") || req.user!.roles.includes("owner")) {
    const result = await query(
      `
      select id, full_name, email, primary_role
      from users
      where id <> $1 and status = 'active'
      order by created_at desc
      limit 100
      `,
      [req.user!.id]
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

  const result = await query(
    `
    select trainer_user.id, trainer_user.full_name, trainer_user.email, trainer_user.primary_role
    from users client_user
    join trainers t on t.id = client_user.assigned_trainer_id
    join users trainer_user on trainer_user.id = t.user_id
    where client_user.id = $1
    limit 1
    `,
    [req.user!.id]
  );
  return res.json({ contacts: result.rows });
});

messagesRouter.get("/messages/:userId", requireAuth, async (req, res) => {
  const allowed = await canMessageUser(req.user!.id, req.user!.trainerId, req.user!.roles, req.params.userId);
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
    [req.user!.id, req.params.userId]
  );

  await query("update messages set read_at = now() where sender_user_id = $1 and receiver_user_id = $2 and read_at is null", [
    req.params.userId,
    req.user!.id
  ]);

  res.json({ messages: result.rows.reverse() });
});

messagesRouter.post("/messages", requireAuth, async (req, res, next) => {
  try {
    const input = messageSchema.parse(req.body);
    const allowed = await canMessageUser(req.user!.id, req.user!.trainerId, req.user!.roles, input.receiverUserId);
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
