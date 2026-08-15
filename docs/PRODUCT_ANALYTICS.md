# Product Analytics Contract

## Purpose and privacy boundary

Ascend records validated business events in the existing `analytics_events` table. The application does not send these events to an external analytics provider. Event payloads are strict and versioned; raw images, meal descriptions, health notes, prompts, credentials, tokens, and unnecessary personal information are rejected by schema rather than filtered after collection.

Events use a caller-supplied idempotency key. One-time and persisted-object events derive stable opaque IDs from their authoritative user or record ID. A PostgreSQL transaction advisory lock, database unique index, and event-name/event-ID lookup prevent concurrent duplicates. Every stored event includes its schema version, runtime environment, and test-account marker. An explicit analytics opt-out stops recording before a database connection is opened.

## Event catalogue

| Event | Confirmation point | Properties | Activation status |
| --- | --- | --- | --- |
| `product.registration_started.v1` | Provision request accepted for processing | None | Active |
| `product.registration_completed.v1` | User provisioned | Role, referral applied | Active |
| `product.onboarding_started.v1` | Valid onboarding submission accepted | None | Active |
| `product.onboarding_completed.v1` | Onboarding persisted | Goal type | Active |
| `product.first_meal_logged.v1` | First food row persisted | Manual or photo | Active |
| `product.meal_logged_manually.v1` | Manual/text food row persisted | Text or manual form | Active |
| `product.meal_photo_submitted.v1` | Authenticated estimate request accepted | None | Active |
| `product.meal_ai_succeeded.v1` | AI estimate returned successfully | Photo or text | Active |
| `product.meal_ai_failed.v1` | AI estimate failed | Bounded failure code, mode | Active |
| `product.progress_entry_created.v1` | Weight or progress photo persisted | Weight or photo | Active |
| `product.trainer_invitation_sent.v1` | Reserved for confirmed invite delivery | None | Defined, not yet activated |
| `product.trainer_connection_completed.v1` | Reserved for persisted trainer/client connection | None | Defined, not yet activated |
| `product.subscription_started.v1` | Reserved for provider-verified activation | Provider, plan | Defined, not yet activated |
| `product.subscription_renewed.v1` | Reserved for provider-verified renewal | Provider, plan | Defined, not yet activated |
| `product.subscription_failed.v1` | Reserved for provider-confirmed failure | Provider, bounded failure code | Defined, not yet activated |
| `product.notification_opened.v1` | Reserved for an explicit notification-open callback | Channel | Defined, not yet activated |
| `product.account_deletion_requested.v1` | Durable deletion request created | Immediate or manual review | Active |

Defined-only events are intentionally not inferred from adjacent actions. They must be activated at the exact provider or delivery confirmation point in a later, separately verified change.

## Metric definitions

- **Activation:** a registered user who completes onboarding and records at least one meal, movement, weight, water, habit, or progress event within seven calendar days of registration. The non-meal activation inputs require the same typed event treatment before this metric is production-complete.
- **DAU / WAU / MAU:** distinct non-test, non-opted-out active users with at least one confirmed product event in one day / rolling seven days / rolling 30 days. Authentication alone is not activity.
- **D1 / D7 / D30 retention:** percentage of a registration cohort with a confirmed product event on the respective user-local calendar day after registration. Use explicit calendar-day windows, not elapsed 24-hour buckets.
- **Meal-logging frequency:** confirmed meals per active user and distinct meal-logging days per active user over the selected period.
- **AI success rate:** successful meal AI events divided by successful plus failed meal AI events, grouped by mode and environment. Submission events are used to detect missing outcomes.
- **Onboarding completion:** completed onboarding events divided by started onboarding events for the same registration cohort.
- **Trainer connection rate:** confirmed trainer connections divided by successfully delivered trainer invitations. This remains unavailable until both events are activated.
- **Subscription conversion:** provider-verified subscription starts divided by eligible activated users. This remains unavailable until provider lifecycle events are activated.
- **Churn indicators:** provider-verified failed/expired subscription state plus declining confirmed product activity. Do not label a user as churned from inactivity alone.

No historical values are claimed. Test accounts must be excluded from product reporting, and staging/development events must never be combined with production.
