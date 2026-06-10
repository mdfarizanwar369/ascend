import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

export const gymsRouter = Router();

gymsRouter.get("/gyms", async (_req, res) => {
  const result = await query("select id, name, slug, location, country, timezone from gyms order by name");
  res.json({ gyms: result.rows });
});

gymsRouter.post("/admin/gyms", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const { name, slug, location, country, timezone } = req.body;
  const result = await query(
    "insert into gyms (name, slug, location, country, timezone) values ($1, $2, $3, $4, $5) returning *",
    [name, slug, location, country ?? "Malaysia", timezone ?? "Asia/Kuala_Lumpur"]
  );
  res.status(201).json({ gym: result.rows[0] });
});

