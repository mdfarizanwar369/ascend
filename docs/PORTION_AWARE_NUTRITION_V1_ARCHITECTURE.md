# Portion-Aware Nutrition V1 Architecture

## Existing production flow

1. `FoodLogClient` resizes a selected meal photo to a JPEG data URL.
2. `POST /food-logs/estimate-data-url` validates authentication, image size/type, rate limits, and the user's existing Food AI allowance.
3. `estimateFoodFromImage` hashes the image, checks the shared estimate cache, and makes one Gemini or OpenAI vision request on a cache miss.
4. The legacy provider contract returns one meal-level `FoodEstimate` containing a food name, one confidence score, calories, macros, and notes.
5. `normalizeWithLocalFoodDatabase` looks for an exact regional-food name or alias when confidence is at least 0.8.
6. On a match, the local row's `typical_*` serving totals replace the provider's visible-portion estimate.
7. The frontend lets the member edit meal-level totals, uploads the existing photo once, and saves the final totals plus `ai_estimate_raw` to `food_logs`.
8. Dashboard nutrition totals sum the values already stored on each meal. Historical meals are not dynamically recalculated.

## Where portion information is lost

The legacy image prompt asks the model to consider the visible portion, but quantity is not represented as structured data. The local normalization step then replaces high-confidence regional-food nutrition with fixed standard-serving totals. The database match is therefore allowed to erase the only portion signal.

The existing `local_food_items` rows contain per-serving totals only. They do not declare a serving weight, per-100g basis, or data provenance. Seed rows also use generic serving values, so deriving a per-gram density from them would create false precision.

## V1 target flow

When `PORTION_AWARE_NUTRITION_V1` is active, or the owner pilot flag is active for the platform owner:

1. The existing single vision request returns a validated item-level response: identity, visible quantity, unit, preparation, recognition confidence, portion confidence, and item nutrition fallback.
2. Each item is normalized independently against `local_food_items`.
3. A local row supplies authoritative nutrition only when it explicitly contains a compatible, scalable nutrition basis.
4. Otherwise, Ascend preserves the provider's item-level visible-portion nutrition. If quantity is unavailable, the existing local standard-serving totals may be used as an honest fallback.
5. The calculation service deterministically aggregates final item nutrition into meal totals.
6. The member can adjust one item quantity. The client rescales from the stored item nutrition basis without another AI request.
7. The save request stores final meal totals as before and adds a versioned `portion_analysis` document containing original AI quantities, final quantities, confidence, source, and adjustment state.

## Responsibility boundary

- Vision AI: identifies foods and estimates the amount visible in this photo.
- Nutrition source: supplies nutrient values for a declared measurable basis where reliable.
- Calculation service: validates quantities, applies scaling, rounds display values, and aggregates totals.
- Member: corrects only the portions that look wrong.

## Backwards compatibility

- Both feature flags default to `false`.
- Flag off uses the existing provider contract, cache namespace, normalization, save payload, and UI.
- Manual text entry remains on the legacy flow.
- Existing `food_logs` rows remain valid; no migration rewrites historical nutrition.
- New database columns are nullable or have non-breaking defaults.
- Reopening history reads stored totals and stored analysis. It never reruns vision AI.

## Feature flags and rollout

- `PORTION_AWARE_NUTRITION_V1=false`: globally disabled.
- `PORTION_AWARE_NUTRITION_OWNER_PILOT=false`: platform-owner-only pilot disabled.

Recommended rollout: platform owner, internal accounts, selected members, then public release after correction-rate review.

## Known V1 limitations

- A single 2D photo cannot measure hidden oil, sauces, density, or occluded ingredients exactly.
- Existing regional rows remain serving fallbacks until a trusted scalable basis and provenance are added.
- Item nutrition falls back to the model when no reliable database density exists.
- V1 records corrections for future analysis but does not personalize future portion estimates.
- V1 does not add a second image, LiDAR, menu lookup, or another AI call.
