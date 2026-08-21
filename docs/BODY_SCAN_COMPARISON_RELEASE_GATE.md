# Body Scan Comparison Intelligence Release Gate

Status: **Validated for controlled preview; recurring scans remain disabled for regular members.**

## What was tested

The release gate covers the complete comparison path from scan-photo extraction to the deterministic coaching conclusion:

- Same recorded scanner model, 31 days apart, with material positive movement
- Same recorded scanner model, 31 days apart, with ordinary measurement noise
- Large apparent movement after only two days
- Material negative movement after 31 days
- Different recorded scanner models with conflicting estimates
- A degraded, rotated, compressed camera image
- A partial follow-up scan with missing muscle and visceral-fat readings
- Unordered histories and unconfirmed drafts
- Missing metrics and zero-coercion regression
- Gradual weight change versus genuinely rapid change
- Member-facing and trainer-facing language consistency
- Introductory scan entitlement and nutrition isolation regressions
- InBody-style sustained change, ordinary variation, and reversed direction
- Tanita whole-body Muscle Mass kept separate from Skeletal Muscle Mass
- Evolt's published before-and-after values withheld from established-trend claims when only two scans exist
- seca skeletal-muscle, fat, and water comparisons without misreading visceral adipose tissue volume as a level
- Measured lean mass kept separate from calculated lean mass
- Same metric labels from different scanner models rejected as equivalent evidence

## Public-source scanner matrix

The permanent regression matrix in `backend/src/tests/bodyCompositionRealWorldMatrix.test.ts` covers four report families. Public manufacturer material is used to confirm metric names, units, and realistic ranges; it is not copied into the product and no personal report images are committed.

| Report family | Public evidence used | Ascend regression covered |
| --- | --- | --- |
| InBody | Result-sheet guidance identifies Weight, Skeletal Muscle Mass, Body Fat Mass, Percent Body Fat, and body-water history | Sustained three-scan change, ordinary variation, reversal, and same-model requirements |
| Tanita MC-780 | The official manual distinguishes whole-body Muscle Mass, Fat Mass, FFM, body water, visceral-fat rating, BMR, and SMI | Generic Muscle Mass is never relabelled as Skeletal Muscle Mass |
| Evolt 360 | Evolt's published case provides two real before/after readings for weight, body fat, fat mass, lean mass, skeletal muscle, and visceral-fat level | The values remain provisional because two scans cannot establish a trend |
| seca mBCA | Official material distinguishes Skeletal Muscle Mass, Fat Mass, Total Body Water, and Visceral Adipose Tissue volume | Compatible metrics can trend; VAT litres are not stored as a visceral-fat level |

The seca longitudinal follow-ups and general InBody/Tanita sequences are de-identified synthetic QA scenarios built around manufacturer-supported fields and plausible ranges. The Evolt pair uses the numeric before/after table published by Evolt, converted from pounds to kilograms. This separation prevents a public example from being presented as invented real history.

Current deterministic result: **11/11 scanner-matrix cases passed**, with **37/37 combined body-composition tests passed** in the focused run.

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

### Expanded AI rerun — 22 August 2026

The repaired branch was rerun through the production-configured `gemini-2.5-flash` extraction path without saving any scan to the database.

| Test set | Extraction | Comparison | Average extraction latency |
| --- | ---: | ---: | ---: |
| Existing mixed-quality benchmark | 8/8 | 7/7 | 8.29 s |
| Manufacturer-specific matrix | 12/12 | 4/4 three-scan histories | 9.47 s |
| Combined | **20/20** | **11/11** | 9.00 s |

The manufacturer matrix used three synthetic report images each for InBody, Tanita, Evolt, and seca. Labels, units, and realistic values were based on the public manufacturer material listed below. The Evolt endpoints use its published before/after values, with a clearly synthetic middle scan added only to exercise the three-scan evidence rule.

The AI correctly:

- converted InBody and Evolt pound readings to kilograms;
- kept Tanita `Muscle Mass` in `muscleMassKg` and left skeletal muscle blank;
- ignored Tanita SMI as a whole-body muscle value;
- extracted Evolt Skeletal Muscle Mass separately from Lean Body Mass;
- left Evolt total-body-water mass out of `bodyWaterPercent`;
- extracted seca SMM while leaving VAT litres and TBW litres out of level/percentage fields;
- produced established three-scan directions only after all three extracted reports passed the scanner, spacing, and confidence rules.

No AI request failed or fell back during the 20-image rerun. Individual extraction latency ranged from 4.53 s to 21.43 s. The generated reports, extracted JSON, and timing logs remain local QA artifacts and contain no member data.

## Interpretation rules

- Fewer than seven days between scans: insufficient evidence
- Different recorded scanner models: insufficient evidence
- Unknown scanner model on either scan: insufficient evidence for a body-composition trend
- Two confirmed scans from the same recorded scanner model: provisional only
- Three confirmed scans from the same recorded scanner model, with adequate spacing and consistent direction: eligible for established metric evidence
- Missing readings remain not comparable and never become zero
- Generic Muscle Mass, Skeletal Muscle Mass, Lean Mass, and Estimated Lean Mass remain separate comparison series
- Visceral-fat levels/ratings are never mixed with visceral-fat mass, area, or volume
- Body-water percentage is never populated from body-water mass or volume
- Small changes stay inside a caution range and are described as "no clear change"
- Body fat: 2 percentage points before directional coaching
- Skeletal muscle: 0.8 kg before directional coaching
- Weight: 0.8 kg before directional coaching
- Visceral fat: 2 levels before directional coaching

These are conservative product guardrails, not clinical thresholds. Ascend reports changes in **scanner readings** and does not claim that the member gained or lost a precise amount of tissue.

## Evidence basis

- InBody preparation guidance recommends consistent test conditions, including similar timing and avoiding food or exercise before testing: https://inbodyusa.com/wp-content/uploads/Preparatory-Steps-Flyer_v1.2_no-bleed.pdf
- InBody result-sheet guidance: https://research.inbody.com/result-sheet-interpretation/
- Tanita MC-780MA-N instruction manual: https://tanita.eu/media/pdf/downloads/MC-780MA-N_Instruction_Manual_EN_Rev%283%29.pdf
- Evolt 360 published before-and-after example: https://evolt360.com/losing-70-pounds/
- Evolt scan preparation guidance: https://knowledge.evolt360.com/hubfs/Playbook%20-%20Evolt%20Challenge%20Playbook.pdf
- seca mBCA controlled-weight-loss case report: https://www.seca.com/fileadmin/media/downloads/mbca/case-reports/en/seca_mBCA_case_report_Age_Manangement_controlled_weight_loss.pdf
- A 2023 precision study found standardising food, fluid, and activity can reduce BIA precision error: https://pubmed.ncbi.nlm.nih.gov/37142404/
- A reliability study observed day-to-day variation even under controlled conditions and emphasizes hydration, food, temperature, and recent activity: https://pmc.ncbi.nlm.nih.gov/articles/PMC11649400/
- Acute hydration has produced material shifts in BIA-derived fat estimates, reinforcing the need for cautious wording: https://pubmed.ncbi.nlm.nih.gov/37335581/

## Release decision

The comparison engine is suitable for an owner-only or small controlled preview after validation. Before a broad Premium release:

1. Test at least one real member's two scans taken roughly four weeks apart with the same recorded scanner model.
2. Confirm the mobile wording and missing-field states on a physical Android and iPhone.
3. Monitor extraction latency and retry frequency during the preview.
4. Keep recurring scan entitlement off until the preview passes.
