drop table if exists body_scan_followups;
drop table if exists body_scan_explanations;
drop index if exists body_composition_scans_user_scope_date_idx;
alter table body_composition_scans drop constraint if exists body_composition_scans_experience_scope_check;
alter table body_composition_scans drop column if exists experience_scope;
