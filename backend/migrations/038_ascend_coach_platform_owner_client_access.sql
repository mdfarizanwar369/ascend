alter table ascend_coach_access_audit_events
  drop constraint if exists ascend_coach_audit_event_type_check;

alter table ascend_coach_access_audit_events
  add constraint ascend_coach_audit_event_type_check check (event_type in (
    'relationship_invited', 'relationship_accepted', 'relationship_declined',
    'relationship_revoked', 'relationship_ended', 'relationship_scopes_requested',
    'legacy_relationship_backfilled', 'pilot_access_granted', 'pilot_access_revoked',
    'legacy_admin_assignment_created', 'legacy_admin_assignment_ended',
    'break_glass_granted', 'break_glass_used', 'break_glass_revoked',
    'platform_owner_client_list_viewed', 'platform_owner_client_read'
  ));
