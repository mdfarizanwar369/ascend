create index if not exists water_logs_user_logged_idx on water_logs(user_id, logged_at desc);
create index if not exists habit_logs_user_logged_idx on habit_logs(user_id, logged_at desc) where completed = true;
create index if not exists analytics_events_user_created_idx on analytics_events(user_id, created_at desc);
create index if not exists trainer_missions_client_completed_idx on trainer_missions(client_user_id, completed_at desc) where status = 'completed';
