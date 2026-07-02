import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool";
import { requireAuth, requirePlatformOwner } from "../middleware/auth";
import { createFounderEmailDrafts, createFounderLeadResearch } from "../integrations/openai";

export const founderRouter = Router();

const leadStatusSchema = z.enum(["Not Contacted", "Email Sent", "Replied", "Meeting Booked", "Demo Completed", "Pilot", "Customer", "Lost"]);

const leadSchema = z.object({
  gymName: z.string().min(1).max(160),
  website: z.string().url().or(z.literal("")).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  publicEmail: z.string().email().or(z.literal("")).nullable().optional(),
  contactPerson: z.string().max(120).nullable().optional(),
  ownerManagerName: z.string().max(120).nullable().optional(),
  linkedinUrl: z.string().url().or(z.literal("")).nullable().optional(),
  instagramUrl: z.string().url().or(z.literal("")).nullable().optional(),
  gymSize: z.string().max(80).nullable().optional(),
  ptFocus: z.string().max(120).nullable().optional(),
  existingApp: z.string().max(120).nullable().optional(),
  aiFitScore: z.number().int().min(1).max(10).optional(),
  status: leadStatusSchema.optional(),
  expectedMrrCents: z.number().int().min(0).optional(),
  currentMrrCents: z.number().int().min(0).optional(),
  sourceUrls: z.array(z.string().url()).max(12).optional()
});

const noteSchema = z.object({
  noteType: z.enum(["general", "meeting", "objection", "feature_request", "next_action"]).default("general"),
  body: z.string().min(1).max(5000)
});

const conversationSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["gmail", "linkedin", "instagram", "manual"]),
  direction: z.enum(["outbound", "inbound"]),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().min(1).max(12000),
  externalMessageId: z.string().max(300).nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  receivedAt: z.string().datetime().nullable().optional()
});

const researchSchema = z.object({
  website: z.string().url(),
  gymName: z.string().max(160).optional()
});

const emailDraftSchema = z.object({
  leadId: z.string().uuid().optional(),
  research: z.record(z.unknown()).optional(),
  outreachAngle: z.string().max(2000).optional()
});

function toNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

async function fetchWebsiteText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Ascend founder lead research bot; contact: founder@getascend.fit"
      }
    });
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const text = await response.text();
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 9000);
  } finally {
    clearTimeout(timeout);
  }
}

function mapLead(row: Record<string, unknown>) {
  return {
    id: row.id,
    gymName: row.gym_name,
    website: row.website,
    country: row.country,
    city: row.city,
    publicEmail: row.public_email,
    contactPerson: row.contact_person,
    ownerManagerName: row.owner_manager_name,
    linkedinUrl: row.linkedin_url,
    instagramUrl: row.instagram_url,
    gymSize: row.gym_size,
    ptFocus: row.pt_focus,
    existingApp: row.existing_app,
    aiFitScore: row.ai_fit_score,
    status: row.status,
    expectedMrrCents: row.expected_mrr_cents,
    currentMrrCents: row.current_mrr_cents,
    lastContactedAt: row.last_contacted_at,
    nextActionAt: row.next_action_at,
    research: row.research,
    emailDrafts: row.email_drafts,
    sourceUrls: row.source_urls,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

founderRouter.use("/founder", requireAuth, requirePlatformOwner);

founderRouter.get("/founder/leads", async (_req, res, next) => {
  try {
    const result = await query(`
      select *
      from founder_leads
      order by
        case status
          when 'Replied' then 1
          when 'Meeting Booked' then 2
          when 'Demo Completed' then 3
          when 'Pilot' then 4
          when 'Email Sent' then 5
          when 'Not Contacted' then 6
          when 'Customer' then 7
          else 8
        end,
        ai_fit_score desc,
        updated_at desc
    `);
    res.json({ leads: result.rows.map(mapLead) });
  } catch (error) {
    next(error);
  }
});

founderRouter.get("/founder/dashboard", async (_req, res, next) => {
  try {
    const [summary, byStatus] = await Promise.all([
      query<{
        leads: string;
        emails_sent: string;
        replies: string;
        meetings_booked: string;
        pilots: string;
        customers: string;
        mrr_cents: string;
        expected_mrr_cents: string;
      }>(`
        select
          count(*)::text as leads,
          count(*) filter (where status <> 'Not Contacted')::text as emails_sent,
          count(*) filter (where status in ('Replied','Meeting Booked','Demo Completed','Pilot','Customer'))::text as replies,
          count(*) filter (where status in ('Meeting Booked','Demo Completed','Pilot','Customer'))::text as meetings_booked,
          count(*) filter (where status in ('Pilot','Customer'))::text as pilots,
          count(*) filter (where status = 'Customer')::text as customers,
          coalesce(sum(current_mrr_cents), 0)::text as mrr_cents,
          coalesce(sum(expected_mrr_cents), 0)::text as expected_mrr_cents
        from founder_leads
      `),
      query("select status, count(*)::int as count from founder_leads group by status order by status")
    ]);
    const row = summary.rows[0];
    const leads = Number(row?.leads ?? 0);
    const emailsSent = Number(row?.emails_sent ?? 0);
    const replies = Number(row?.replies ?? 0);
    res.json({
      summary: {
        leads,
        emailsSent,
        openRate: null,
        replyRate: emailsSent ? Math.round((replies / emailsSent) * 100) : 0,
        meetingsBooked: Number(row?.meetings_booked ?? 0),
        pilots: Number(row?.pilots ?? 0),
        customers: Number(row?.customers ?? 0),
        mrrCents: Number(row?.mrr_cents ?? 0),
        expectedMrrCents: Number(row?.expected_mrr_cents ?? 0)
      },
      byStatus: byStatus.rows
    });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/leads", async (req, res, next) => {
  try {
    const input = leadSchema.parse(req.body);
    const result = await query(
      `
      insert into founder_leads (
        gym_name, website, country, city, public_email, contact_person, owner_manager_name,
        linkedin_url, instagram_url, gym_size, pt_focus, existing_app, ai_fit_score, status,
        expected_mrr_cents, current_mrr_cents, source_urls, created_by
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      returning *
      `,
      [
        input.gymName,
        toNull(input.website),
        toNull(input.country),
        toNull(input.city),
        toNull(input.publicEmail),
        toNull(input.contactPerson),
        toNull(input.ownerManagerName),
        toNull(input.linkedinUrl),
        toNull(input.instagramUrl),
        toNull(input.gymSize),
        toNull(input.ptFocus),
        toNull(input.existingApp),
        input.aiFitScore ?? 5,
        input.status ?? "Not Contacted",
        input.expectedMrrCents ?? 0,
        input.currentMrrCents ?? 0,
        input.sourceUrls ?? [],
        req.user!.id
      ]
    );
    res.status(201).json({ lead: mapLead(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

founderRouter.patch("/founder/leads/:leadId", async (req, res, next) => {
  try {
    const input = leadSchema.partial().parse(req.body);
    const result = await query(
      `
      update founder_leads set
        gym_name = coalesce($2, gym_name),
        website = coalesce($3, website),
        country = coalesce($4, country),
        city = coalesce($5, city),
        public_email = coalesce($6, public_email),
        contact_person = coalesce($7, contact_person),
        owner_manager_name = coalesce($8, owner_manager_name),
        linkedin_url = coalesce($9, linkedin_url),
        instagram_url = coalesce($10, instagram_url),
        gym_size = coalesce($11, gym_size),
        pt_focus = coalesce($12, pt_focus),
        existing_app = coalesce($13, existing_app),
        ai_fit_score = coalesce($14, ai_fit_score),
        status = coalesce($15, status),
        expected_mrr_cents = coalesce($16, expected_mrr_cents),
        current_mrr_cents = coalesce($17, current_mrr_cents),
        source_urls = coalesce($18, source_urls),
        updated_at = now()
      where id = $1
      returning *
      `,
      [
        req.params.leadId,
        input.gymName,
        toNull(input.website),
        toNull(input.country),
        toNull(input.city),
        toNull(input.publicEmail),
        toNull(input.contactPerson),
        toNull(input.ownerManagerName),
        toNull(input.linkedinUrl),
        toNull(input.instagramUrl),
        toNull(input.gymSize),
        toNull(input.ptFocus),
        toNull(input.existingApp),
        input.aiFitScore,
        input.status,
        input.expectedMrrCents,
        input.currentMrrCents,
        input.sourceUrls
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Lead not found" });
    res.json({ lead: mapLead(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/leads/:leadId/notes", async (req, res, next) => {
  try {
    const input = noteSchema.parse(req.body);
    const result = await query(
      `
      insert into founder_lead_notes (lead_id, note_type, body, created_by)
      values ($1, $2, $3, $4)
      returning id, lead_id, note_type, body, created_at
      `,
      [req.params.leadId, input.noteType, input.body, req.user!.id]
    );
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

founderRouter.get("/founder/leads/:leadId/notes", async (req, res, next) => {
  try {
    const result = await query(
      "select id, lead_id, note_type, body, created_at from founder_lead_notes where lead_id = $1 order by created_at desc limit 100",
      [req.params.leadId]
    );
    res.json({ notes: result.rows });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/conversations", async (req, res, next) => {
  try {
    const input = conversationSchema.parse(req.body);
    const result = await query(
      `
      insert into founder_lead_conversations (
        lead_id, channel, direction, subject, body, external_message_id, approved_by, sent_at, received_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning *
      `,
      [
        input.leadId,
        input.channel,
        input.direction,
        toNull(input.subject),
        input.body,
        toNull(input.externalMessageId),
        input.direction === "outbound" ? req.user!.id : null,
        input.sentAt ?? null,
        input.receivedAt ?? null
      ]
    );
    res.status(201).json({ conversation: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

founderRouter.get("/founder/leads/:leadId/conversations", async (req, res, next) => {
  try {
    const result = await query("select * from founder_lead_conversations where lead_id = $1 order by created_at desc limit 100", [req.params.leadId]);
    res.json({ conversations: result.rows });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/research", async (req, res, next) => {
  try {
    const input = researchSchema.parse(req.body);
    const websiteText = await fetchWebsiteText(input.website);
    const research = await createFounderLeadResearch(
      `Gym name: ${input.gymName ?? "Unknown"}\nWebsite: ${input.website}\nPublic website text:\n${websiteText}`
    );
    res.json({ research, sourceUrl: input.website, sourceChars: websiteText.length });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/leads/:leadId/research", async (req, res, next) => {
  try {
    const lead = await query("select * from founder_leads where id = $1", [req.params.leadId]);
    if (!lead.rows[0]) return res.status(404).json({ error: "Lead not found" });
    const website = String(lead.rows[0].website ?? "");
    if (!website) return res.status(400).json({ error: "Lead has no website" });
    const websiteText = await fetchWebsiteText(website);
    const research = await createFounderLeadResearch(
      `Lead: ${JSON.stringify(mapLead(lead.rows[0]))}\nPublic website text:\n${websiteText}`
    );
    const updated = await query("update founder_leads set research = $2, updated_at = now() where id = $1 returning *", [req.params.leadId, research]);
    res.json({ lead: mapLead(updated.rows[0]), research, sourceChars: websiteText.length });
  } catch (error) {
    next(error);
  }
});

founderRouter.post("/founder/email-drafts", async (req, res, next) => {
  try {
    const input = emailDraftSchema.parse(req.body);
    let leadContext = input.research ? JSON.stringify(input.research) : "";
    if (input.leadId) {
      const lead = await query("select * from founder_leads where id = $1", [input.leadId]);
      if (!lead.rows[0]) return res.status(404).json({ error: "Lead not found" });
      leadContext = JSON.stringify(mapLead(lead.rows[0]));
    }
    const drafts = await createFounderEmailDrafts(`Lead/research context: ${leadContext}\nOutreach angle: ${input.outreachAngle ?? "Use the strongest relevant angle."}`);
    if (input.leadId) {
      await query("update founder_leads set email_drafts = $2, updated_at = now() where id = $1", [input.leadId, drafts]);
    }
    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

founderRouter.get("/founder/gmail/status", (_req, res) => {
  res.json({
    connected: false,
    available: false,
    message: "Gmail sending and reply sync require Google OAuth credentials and explicit manual approval before any email is sent.",
    manualApprovalRequired: true
  });
});
