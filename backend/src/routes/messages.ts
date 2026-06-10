import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const messagesRouter = Router();

const messageSchema = z.object({
  receiverUserId: z.string().uuid(),
  body: z.string().min(1).max(4000)
});

messagesRouter.get("/messages/:userId", requireAuth, async (req, res) => {
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
  res.json({ messages: result.rows.reverse() });
});

messagesRouter.post("/messages", requireAuth, async (req, res, next) => {
  try {
    const input = messageSchema.parse(req.body);
  const result = await query(
    "insert into messages (sender_user_id, receiver_user_id, body) values ($1, $2, $3) returning *",
    [req.user!.id, input.receiverUserId, input.body]
  );
  res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
