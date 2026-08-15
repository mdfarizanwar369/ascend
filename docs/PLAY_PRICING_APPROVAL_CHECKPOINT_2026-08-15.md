# Google Play pricing approval checkpoint

Date: 2026-08-15

No Google Play subscription product or base plan has been created or activated. This document is the owner approval gate.

| Item | Required information |
| --- | --- |
| Current Stripe monthly plan | Premium, RM19.99/month, MYR, grants the existing `premium` entitlement |
| Current Stripe yearly plan | None approved or configured in Ascend's product catalogue |
| Proposed Play monthly product ID | `ascend_premium_monthly` |
| Proposed monthly base-plan ID | `monthly` |
| Proposed Play monthly price | RM19.99/month (recommended parity; owner approval required) |
| Proposed Play yearly product ID | `ascend_premium_yearly` |
| Proposed yearly base-plan ID | `yearly` |
| Proposed Play yearly price | Not approved; do not create or infer a price |
| Regions | Malaysia for the initial closed-test configuration; expansion requires a separate decision |
| Trial | None for the first closed test |
| Grace period | Proposed seven days; owner approval required |
| Account hold | Proposed enabled using Google Play's supported recovery behaviour; exact duration to be selected in Play Console after approval |
| Resubscribe | Proposed enabled |
| Entitlement | Existing `premium` entitlement only. It does not grant Trainer Pro or Athlete Mode unless those are separately assigned. |
| Platform-price difference | None proposed. Price parity is clearer for customers; Google Play fees reduce Android net margin. Raising only the Android price may preserve margin but adds customer confusion and conversion friction. |

## Recommendation

Start Closed Alpha with one monthly Premium product at RM19.99, no trial, Malaysia only, a seven-day grace period, account hold enabled, and resubscribe enabled. Keep the yearly product uncreated until its commercial price and discount strategy are explicitly approved.

## Approval required

Approve or amend each proposed value above before any product or base plan is created in Google Play Console.
