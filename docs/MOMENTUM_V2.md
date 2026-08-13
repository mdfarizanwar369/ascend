# Momentum V2

Momentum is a deterministic seven-day coaching signal built from four pillars:

- Fuel: meal logging, calorie context and protein consistency.
- Move: manual workouts, activity logs and Health Connect activity.
- Recover: hydration, optional sleep quality and sensible training balance.
- Personal Focus: non-duplicative habits and trainer missions, when active.

Recent days carry more weight. Weight logs remain visible throughout Ascend but do not earn Momentum points. Missing sleep data is neutral.

## Weights

With a Personal Focus: Fuel 35, Move 35, Recover 20, Focus 10.

Without a Personal Focus: Fuel 40, Move 40, Recover 20. The member is not penalized for having no configured habit or mission.

## Rollback

Set `MOMENTUM_V2=false` on the backend and redeploy. Existing routes then return the legacy score, and trainer, report, notification and Coach Presence reads use `compliance_scores` again.

The additive tables may remain safely in place. To remove them after rollback, run `backend/migrations/rollbacks/024_momentum_v2.down.sql` manually only after confirming no V2 data is needed.
