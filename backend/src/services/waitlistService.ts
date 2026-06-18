import { pool } from "../db/pool";

export async function ensureWaitlistSchema() {
  await pool.query(`
    create extension if not exists "uuid-ossp";

    create table if not exists waitlist_leads (
      id uuid primary key default uuid_generate_v4(),
      full_name text not null,
      contact text not null,
      role text not null,
      gym_or_company text,
      country text,
      source text not null default 'homepage',
      status text not null default 'new',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists waitlist_leads_contact_role_idx
      on waitlist_leads(lower(contact), role);

    create index if not exists waitlist_leads_created_idx
      on waitlist_leads(created_at desc);
  `);
}
