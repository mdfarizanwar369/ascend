with ranked_events as (
  select
    id,
    row_number() over (
      partition by provider, provider_reference, event_type
      order by created_at desc, id desc
    ) as duplicate_rank
  from payment_events
  where provider = 'google_play'
    and event_type = 'google_play_rtdn'
)
delete from payment_events
where id in (
  select id
  from ranked_events
  where duplicate_rank > 1
);

create unique index if not exists payment_events_google_play_rtdn_unique_idx
  on payment_events(provider_reference, event_type)
  where provider = 'google_play' and event_type = 'google_play_rtdn';
