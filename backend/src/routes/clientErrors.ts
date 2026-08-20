import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { saveClientError } from "../services/clientErrorService";

export const clientErrorsRouter = Router();

const clientErrorSchema = z.object({
  route: z.string().trim().min(1).max(300),
  source: z.string().trim().min(1).max(80),
  errorName: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(4_000),
  stack: z.string().max(8_000).nullable().optional(),
  appVersion: z.string().max(80).nullable().optional()
});

clientErrorsRouter.post("/client-errors", requireAuth, async (req, res, next) => {
  try {
    const input = clientErrorSchema.parse(req.body);
    await saveClientError({
      userId: req.user!.id,
      ...input,
      userAgent: req.header("user-agent") ?? null
    });
    res.status(202).json({ recorded: true });
  } catch (error) {
    next(error);
  }
});
