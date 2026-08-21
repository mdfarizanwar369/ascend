# Body Scan Comparison Intelligence Release Gate

Status: **Validated for controlled preview; recurring scans remain disabled for regular members.**

## What was tested

The release gate covers the complete comparison path from scan-photo extraction to the deterministic coaching conclusion:

- Same-machine scans 31 days apart with material positive movement
- Same-machine scans 31 days apart with ordinary measurement noise
- Large apparent movement after only two days
- Material negative movement after 31 days
- Different-machine scans with conflicting estimates
- A degraded, rotated, compressed camera image
- A partial follow-up scan with missing muscle and visceral-fat readings
- Unordered histories and unconfirmed drafts
- Missing metrics and zero-coercion regression
- Gradual weight change versus genuinely rapid change
- Member-facing and trainer-facing language consistency
- Introductory scan entitlement and nutrition isolation regressions

## Real Gemini benchmark

Provider: Gemini 2.5 Flash

| Result | Before reliability fix | After reliability fix |
| --- | ---: | ---: |
| Scan extraction | 5/8 | 8/8 |
| Comparison conclusions | 4/7 | 7/7 |
| Average extraction latency | 15.2 s | 14.0 s |
| Worst case | 25 s fallback | 45.9 s after one bounded retry |

The failed first run was caused by three transient 25-second provider timeouts. The extraction path previously converted each single timeout directly into an empty manual-entry fallback. It now makes one bounded retry for retryable Gemini failures. No repeated or background AI calls were added.

Benchmark artifacts are generated locally under `work/body-scan-comparison-benchmark/results` and remain excluded from source control because they are QA output, not application assets.

## Interpretation rules

- Fewer than seven days between scans: insufficient evidence
- Different recorded machines: insufficient evidence
- Unknown machine on either scan: comparison is possible, never high confidence
- Same machine, at least 21 days apart, confirmed extraction confidence: high confidence
- Missing readings remain not comparable and never become zero
- Small changes stay inside a caution range and are described as "no clear change"
- Body fat: 2 percentage points before directional coaching
- Skeletal muscle: 0.8 kg before directional coaching
- Weight: 0.8 kg before directional coaching
- Visceral fat: 2 levels before directional coaching

These are conservative product guardrails, not clinical thresholds. Ascend reports changes in **machine readings** and does not claim that the member gained or lost a precise amount of tissue.

## Evidence basis

- InBody preparation guidance recommends consistent test conditions, including similar timing and avoiding food or exercise before testing: https://inbodyusa.com/wp-content/uploads/Preparatory-Steps-Flyer_v1.2_no-bleed.pdf
- A 2023 precision study found standardising food, fluid, and activity can reduce BIA precision error: https://pubmed.ncbi.nlm.nih.gov/37142404/
- A reliability study observed day-to-day variation even under controlled conditions and emphasizes hydration, food, temperature, and recent activity: https://pmc.ncbi.nlm.nih.gov/articles/PMC11649400/
- Acute hydration has produced material shifts in BIA-derived fat estimates, reinforcing the need for cautious wording: https://pubmed.ncbi.nlm.nih.gov/37335581/

## Release decision

The comparison engine is suitable for an owner-only or small controlled preview after validation. Before a broad Premium release:

1. Test at least one real member's two scans taken roughly four weeks apart on the same machine.
2. Confirm the mobile wording and missing-field states on a physical Android and iPhone.
3. Monitor extraction latency and retry frequency during the preview.
4. Keep recurring scan entitlement off until the preview passes.

