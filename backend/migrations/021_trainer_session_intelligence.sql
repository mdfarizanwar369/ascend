alter table trainer_coaching_sessions
  add column if not exists session_intelligence jsonb;

create index if not exists trainer_coaching_sessions_intelligence_idx
  on trainer_coaching_sessions(client_id, completed_at desc)
  where status = 'completed' and session_intelligence is not null;
