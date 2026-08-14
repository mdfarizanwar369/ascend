# Account Deletion Runbook

## Authority and states

PostgreSQL `account_deletion_requests` is the deletion system of record. A request progresses through:

`requested -> firebase -> storage -> database -> completed`

An external failure changes the stage to `retry_required`. Business-role, platform-owner, or live-billing dependencies use `manual_review`. The user is marked inactive before provider work begins, so deletion-pending accounts cannot use normal authenticated APIs.

## Idempotent steps

1. **Firebase:** revoke refresh tokens and delete the Firebase identity. `auth/user-not-found` is success on retry.
2. **Storage:** delete the captured set of food, profile, progress, body-scan, and controlled-upload object keys. Repeated deletion is safe.
3. **Database:** null retained attribution references where required and delete the user. Foreign-key cascades remove account-linked application data.
4. **Evidence:** record stage timestamps, attempts, a safe error code, and completion time. Do not store provider responses or personal payloads in workflow logs.

The API returns `200 deleted` only after every stage is recorded complete. It returns `202 requested` if work remains. The daily maintenance job retries immediate requests at least 15 minutes after the previous attempt, up to 20 attempts.

## Manual review

1. Confirm the requester and request ID.
2. Cancel or reconcile active billing outside Ascend before deletion.
3. Reassign or close trainer/business relationships and preserve legally required financial records.
4. Convert the request to immediate processing through an audited operational procedure after dependencies are cleared. This sprint does not add an unauthenticated or broad admin bypass.
5. Confirm all three provider timestamps and `status=completed` before telling the user deletion is complete.

## Deleted, anonymised, and retained data

- **Deleted:** Firebase credentials; Ascend profile; meals, water, weight, workouts, habits, messages, Coach Zoe records, reports, Health Connect records, progress/body-scan records; stored user media.
- **Detached/anonymised:** referral attribution that must remain for aggregate/business integrity has its user reference removed.
- **Potentially retained:** processor invoices, tax/accounting records, fraud/security evidence, and encrypted backups until normal expiry. These are not treated as active account data.

## Failure response

Query non-sensitive workflow fields only. Investigate `last_error_code`, provider health, and attempt count. Never manually set `completed` without provider evidence. Escalate requests approaching 20 attempts or the published 30-day period.
