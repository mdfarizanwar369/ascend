# Zoe beginner routine: owner pilot

## Scope and user experience

This is an optional, platform-owner-only preview within the existing Coach Zoe
screen. It does not enroll existing users or add a screen, tab, subscription,
provider, background AI task or public rollout flag.

Open Coach Zoe from Home, then use **Keep building with Zoe → Start my routine**
below Quick Coach Actions. The current unfinished workout stays intact. Future
sessions can reuse the last location, equipment, goal and duration, with an
explicit option to change them. Pause, resume, stop and one-off workouts remain
secondary options. Leaving does not delete logged activity or routine history.

The programme alternates complementary full-body A/B sessions, retains suitable
main movements for practice and uses the existing equipment constraints,
reviewed exercise visuals, swaps and Gemini generation path. The conservative
prescription avoids advanced primary exercises and caps resistance work at two
sets. Longer slots add appropriate timed movement rather than forcing more
resistance volume. Estimated durations include the existing warm-up, cooldown
and transitions.

Progress advances when a saved Zoe workout includes all prescribed main
movements. Other partial sessions still count as activity. Recovery/mobility,
dismissal, swaps, reopening, manual exercise and imported health activity do not
advance the routine. A recovery session is offered within 48 hours of a routine
strength session. A return after 14 days uses a comfortable starting effort;
missed days do not reset history. Stages reflect actual qualifying completions
(first three, next five, then gradual building), with no invented weight gains.
The routine continues beyond session twelve.

## Storage and isolation

Migration `047_zoe_beginner_programmes.sql` adds two tables and indexes only.
Existing accounts, workouts, analytics and nutrition rows are not rewritten.
Completion keys and programme ownership are scoped to the authenticated user.
Only the server's `isPlatformOwner === true` qualifies; a gym-owner role does
not grant pilot access. Ordinary members do not query the new programme tables.

The per-user workout lease serializes generation, swaps, dismissal and saving.
No database connection is held during the provider request. Saving the activity
and reconciling programme credit occurs in one fenced transaction. Saving checks
the current prescription under the lease to reject a stale concurrent swap.
Duplicate completion does not produce another credit; deleting the linked
activity removes its credit. Fire-and-forget coaching side effects run after
commit. An unfinished prescription persists across midnight, pauses and exits.
The existing daily generation allowance is preserved.

## Activation and rollback

1. Pass lint/type checks, tests, build and isolated PostgreSQL integration tests.
2. Apply additive migration 047 with the migration credential; verify runtime
   SELECT/INSERT/UPDATE/DELETE permissions on both new tables.
3. Deploy with both flags false and verify frontend/backend readiness, healthy
   instances and the configured deployment overlap/rollback.
4. Set `ZOE_BEGINNER_PROGRAMME_SCHEMA=true` and
   `ZOE_BEGINNER_PROGRAMME_OWNER_PILOT=true` on the intended backend only.
   Gemini must remain the configured AI provider.
5. Verify authenticated owner eligibility and ordinary-member denial before
   asking the owner to test. Starting remains an explicit user action.

Disable `ZOE_BEGINNER_PROGRAMME_OWNER_PILOT` to hide enrollment/controls and
prevent new routine generation. Keep `ZOE_BEGINNER_PROGRAMME_SCHEMA=true` so
existing saved owner sessions can still reopen, swap, dismiss and complete.
No destructive down migration is required. A binary or Apple submission is not
needed for this hosted pilot.

## Validation boundaries

Unit, HTTP and component tests cover owner isolation, rollback, unfinished
sessions, trainer precedence, time zones and completion semantics. Quality tests
cover both session types across the available settings, equipment and durations,
as well as anchor retention, recovery and returning after a break. PostgreSQL
tests require `ASCEND_HARDENING_TEST_DATABASE_URL` and reject any host/database
other than the isolated local CI database; they exercise atomic rollback,
concurrent generation/completion, duplicate prevention and twelve-session
continuity. They never run against production.

Physical exercise performance, suitability for an individual's medical needs
and iPhone interruption behavior still require real-world validation. A planning
estimate is not a measurement of how long someone actually exercises.
