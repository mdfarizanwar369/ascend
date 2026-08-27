# Portion-Aware Nutrition Production V1 Consolidation

## Production Base

- Base branch: `main`
- Base commit: `e13120b Improve portion analysis scene isolation`
- Working branch: `codex/portion-aware-nutrition-production-v1`

## Research Inputs Inspected

- V1: visible quantity estimation, component quantities, deterministic nutrition scaling, editable portions, original/final quantities.
- V1.1: plausibility checks, count handling, safe adjustment behavior, local-food normalization guardrails.
- V1.2: one-attempt provider direction, structured response, component-first mixed meals, malformed-response handling.
- V1.3: calibration research rejected because no correction model beat identity.
- V1.4/V1.4B: segmentation, depth, geometry, and physical-signal research rejected because no production-valid evidence was produced.

## Keep

- Component-first portion estimates from the existing image provider response.
- `nutritionForVisibleQuantity` as the explicit fallback when no verified scalable nutrition density exists.
- Deterministic scaling from final quantity to calories and macros.
- User-adjustable component quantities with no AI call after adjustment.
- Original AI quantity, final quantity, nutrition source, portion source, fallback reason, and owner diagnostics.
- Owner-pilot rollout using `PORTION_AWARE_NUTRITION_OWNER_PILOT`.

## Modify

- Gemini portion-aware photo analysis now performs one automatic provider attempt only.
- Malformed provider output fails gracefully instead of silently retrying with another response mode or model.
- Normal member UI uses conservative wording: estimated from the photo, not measured.
- Whole-piece and slice items do not show generic smaller/larger shortcut buttons that can imply awkward fractional pieces.
- Cache version is `portion-aware-production-v1`.

## Remove / Do Not Port

- No V1.3 calibration artifacts, regression models, food-class multipliers, or runtime calibration.
- No V1.4/V1.4B segmentation, depth models, geometry, plate reconstruction, or physical measurement.
- No extra visual metadata fields such as `plateAreaFraction`, `heightClass`, `containerFillFraction`, or `visualAgreementScore`.
- No research dependencies such as Python ML stacks, SAM, ONNX, Hugging Face transformers, or depth-estimation packages.

## Production Architecture

```text
Photo
→ one structured AI call
→ validated components + visible quantities
→ trusted deterministic checks
→ nutrition scaling/fallback
→ editable estimate
→ save
```

## Provider Call Rules

- Successful photo analysis: 1 provider call.
- Malformed/failed photo analysis: 1 provider call, then graceful fallback UX.
- Explicit user retry: allowed as a new user action and creates a new request.
- Portion edit: 0 provider calls.
- Reopen saved meal: 0 provider calls.

## Known Limits

- A single photo remains an estimate, not a measurement.
- Hidden oil, sauce, deep bowls, overlapping food, and unusual containers remain difficult.
- Malaysia/Singapore scalable nutrition density is still incomplete, so some foods rely on visible-quantity AI nutrition fallback.
