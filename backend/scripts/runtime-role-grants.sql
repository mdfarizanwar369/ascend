-- The operator creates ascend_app_runtime with a generated password first.
-- Run with the migration role. Never put that credential in the HTTP service.
do $$ begin
  execute format('grant connect on database %I to ascend_app_runtime', current_database());
end $$;
grant usage on schema public to ascend_app_runtime;
grant select, insert, update, delete on all tables in schema public to ascend_app_runtime;
grant usage, select on all sequences in schema public to ascend_app_runtime;
revoke all on schema_migrations from ascend_app_runtime;
grant select on schema_migrations to ascend_app_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to ascend_app_runtime;
alter default privileges in schema public grant usage, select on sequences to ascend_app_runtime;
