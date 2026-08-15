create unique index if not exists analytics_events_product_event_id_unique
  on analytics_events (event_name, (metadata->>'eventId'))
  where metadata ? 'eventId';
