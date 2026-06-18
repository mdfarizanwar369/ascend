import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";

const waitlistSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(5).max(160),
  role: z.enum(["member", "trainer", "gym_owner"]),
  gymOrCompany: z.string().trim().max(160).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal(""))
});

export const waitlistRouter = Router();

waitlistRouter.post("/waitlist", async (req, res, next) => {
  try {
    const input = waitlistSchema.parse(req.body);
    const contact = input.contact.toLowerCase();

    const result = await pool.query(
      `
        insert into waitlist_leads (
          full_name,
          contact,
          role,
          gym_or_company,
          country,
          source
        )
        values ($1, $2, $3, $4, $5, 'homepage')
        on conflict (lower(contact), role)
        do update set
          full_name = excluded.full_name,
          gym_or_company = excluded.gym_or_company,
          country = excluded.country,
          updated_at = now()
        returning id, full_name, contact, role, status, created_at
      `,
      [
        input.fullName,
        contact,
        input.role,
        input.gymOrCompany?.trim() || null,
        input.country?.trim() || null
      ]
    );

    res.status(201).json({ lead: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
