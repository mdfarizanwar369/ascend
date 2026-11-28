alter table trainer_coaching_sessions
  add column worksheet jsonb not null default '{}'::jsonb,
  add column share_client_recap boolean not null default true;

-- Existing completed sessions were saved with Confirm & Share.
alter table trainer_coaching_sessions alter column share_client_recap set default false;
update trainer_coaching_sessions set share_client_recap = false where status <> 'completed';

drop index trainer_coaching_sessions_active_draft_idx;
create unique index trainer_coaching_sessions_active_draft_idx
  on trainer_coaching_sessions (created_by_user_id, client_id, coalesce(gym_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'draft';
