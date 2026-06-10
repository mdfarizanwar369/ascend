import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

export const complianceRouter = Router();

complianceRouter.get("/compliance/today", requireAuth, async (req, res) => {
  const result = await query("select * from compliance_scores where user_id = $1 and calculated_for_date = current_date", [
    req.user!.id
  ]);
  res.json({ compliance: result.rows[0] ?? null });
});

complianceRouter.get("/compliance/history", requireAuth, async (req, res) => {
  const result = await query(
    "select * from compliance_scores where user_id = $1 order by calculated_for_date desc limit 30",
    [req.user!.id]
  );
  res.json({ compliance: result.rows });
});

complianceRouter.get(
  "/trainer/clients/:clientId/compliance",
  requireAuth,
  requireRole(["trainer", "admin", "owner"]),
  async (req, res) => {
    const result = await query(
      `
      select cs.*
      from compliance_scores cs
      join users u on u.id = cs.user_id
      where cs.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      order by cs.calculated_for_date desc
      limit 30
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
    );
    res.json({ compliance: result.rows });
  }
);

