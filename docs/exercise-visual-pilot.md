# Zoe exercise visual pilot

This is a 53-exercise, manually reviewed illustration pilot for Zoe Workout Builder. It augments the existing free-text workout objects; no saved record is rewritten and no new canonical exercise ID is required in workout storage. For eligible pilot members, Zoe receives the reviewed exercise names as a preference only when they fit the member and available equipment. Mixed visual and text-only workouts are expected.

Production access fails closed behind `EXERCISE_VISUALS_ENABLED`. When enabled, access is limited to the platform owner plus the comma-separated user IDs in `EXERCISE_VISUALS_USER_IDS`. The server returns the verified access decision from `/me`; the UI never enables the pilot from a browser-only flag. Visual telemetry is also rejected for accounts outside the pilot.

## Approved artwork

The 19 candidates in the 2 October 2026 frequency audit were checked against exercise guidance and source poses. The first 14 approved movements are Bodyweight Squat, Glute Bridge, Child's Pose, Bird-Dog, Kneeling Hip Flexor Stretch, Dumbbell Romanian Deadlift, Standing Quad Stretch, Bodyweight Reverse Lunge, Dumbbell Bench Press, Dumbbell Floor Press, Dumbbell Shoulder Press, Bench Hamstring Stretch, Hanging Knee Raise, and Thread the Needle. Nine have a start/peak pair and five use one static pose. The current Ascend artwork uses its own reviewed start and peak ordering.

Five earlier RepDB proposals were rejected after inspection:

| Candidate | Reason |
| --- | --- |
| Cat-Cow | The one still shows a neutral setup, not either spinal movement phase. |
| Walking | The one still adds little instructional value. |
| Step Ups | The supposed peak is mid-step with the foot in the air, rather than a stable finished position. |
| Scapular Pull Ups | The two poses barely distinguish the small scapular motion. |
| Lat Pulldown | The peak appears behind the neck although the written instruction says upper chest. |

Generic Goblet Squat, generic Reverse Lunge, Downward Dog to Cobra, and generic Plank are also intentionally absent. A similar exercise with different equipment, body position, or movement phase is not a safe substitute.

### Common-movement expansion

The next 18 approved variants are Push-Up, Knee Push-Up, Jumping Jacks, Crunch, Dead Bug, High Plank, Forearm Side Plank, Wall Sit, Bodyweight Walking Lunge, Machine Chest Press, Seated Cable Row, 45-Degree Leg Press, Dumbbell Lateral Raise, Dumbbell Bicep Curl, Pull-Up, Machine-Assisted Pull-Up, Bent-Over Dumbbell Row, and Straight-Bar Cable Triceps Pushdown. The new Forearm Plank artwork brings the registry to 33 exercises.

### Zoe location and equipment expansion

On 3 October 2026, production Coach Zoe was sampled in Chrome using the signed-in synthetic review account. Gym / Full Gym and Home / Bodyweight both returned the same fixed fallback session, despite AI sharing being enabled for the review account. A direct Gemini probe using the app's exact Zoe prompt and a fictional context showed the cause: the production Gemini 3.6 Flash response exhausted its 1,400-token output limit, using roughly 1,000 tokens for thinking and returning incomplete JSON. The backend now requests structured JSON with low thinking and a 4,096-token limit for web Gemini workouts; the existing fallback remains if the provider fails. The review account's AI sharing setting was restored to Off after the live checks.

To survey the requested equipment options without sending member data, we called the configured production Gemini model directly with the app's prompt, the corrected generation settings, and fictional context. These 11 samples cover Gym (Full Gym, Limited Gym), Home (Bodyweight, Dumbbells, Resistance Bands), Hotel (Bodyweight, Dumbbells, Resistance Bands), and Outdoors (Bodyweight, Walking or Running Route, Park Bench or Bars). This is a scenario sample, **not** a measured frequency estimate or a live production UI result. The 48 sampled exercise slots now resolve 25 visual names; 6 are explicitly ambiguous and 17 remain unresolved. Ambiguous or combined alternatives stay text-only.

Sixteen newly illustrated movements add coverage for Dumbbell Goblet Squat, Lat Pulldown, Bench Incline Push-Up, Bench-Supported Single-Arm Dumbbell Row, Band Pull-Apart, Standing Band Squat, Band Bent-Over Row, Band Overhead Shoulder Press, Standing Band Pallof Press, Band Monster Walk, Bench Dip, Inverted Row, Cat-Cow Stretch, World's Greatest Stretch, Standing Band Chest Press, and Bench Step-Up. They use 32 new start/peak stills in `ascend-original-v2`. Prior RepDB Cat-Cow and Lat Pulldown candidates remain rejected; the new original artwork shows the actual cat/cow phases and a pulldown in front of the chest. Earlier rejected bench-dip and step-up stills were also replaced with reviewed original poses. Generic variants such as Plank Hold, Goblet Squat, Single-Arm Dumbbell Row without stated support, and names that offer two exercises with “or” remain text-only.

This expansion is based on the common squat, lunge, push, pull, and core movements illustrated in [ACE's beginner workout guide](https://www.acefitness.org/resources/pros/expert-articles/5248/total-body-workout-for-beginners/), [ACE's bodyweight workout builder](https://www.acefitness.org/continuing-education/certified/december-2024/8763/the-ace-body-weight-workout-builder/), and Ascend's gym fallback and capture fixtures. Fallback and fixture names are representative product inputs, **not measured Zoe generation frequency**. The earlier 103 observed exercise slots remain the only measured sample; the expansion does not establish a new coverage percentage for that sample or for all members.

Two additional candidate visuals were rejected: Wall Push-Ups, because the images omit the wall that defines the movement, and Barbell Bench Press, because the lowered image places the bar near the neck rather than mid-chest. Both stay text-only. Generic Side Plank, Walking Lunge, Leg Press, Assisted Pull-Up, and Cable Triceps Pushdown are also text-only: the selected images show a forearm hold, bodyweight lunge, 45-degree sled, assisted machine, and straight-bar cable attachment respectively, while those generic names do not establish the variant. The registry does not substitute another exercise's picture.

## Structure and rules

`shared/src/exerciseVisuals.ts` is the complete allowlist. Each entry has a stable Ascend ID, canonical name, approved aliases, equipment, movement pattern, target muscles, local image paths, and reviewed short coaching text. `resolveExerciseVisual` compares only exact names and explicit aliases after case, whitespace, and curly-apostrophe normalization. It makes no semantic, AI, equipment, or fuzzy inference. Known ambiguous names are marked `ambiguous`; everything else is `unresolved`. Both keep the original text-only card. Existing exercise notes always remain visible when expanded. Generic Plank remains ambiguous because the registry has both High Plank and Forearm Plank.

The expanded card provides the visual, equipment, target muscles, instructions, cue, a reporting control, and an Ascend ownership label. Images are visible as soon as the browser paints them, independent of a JavaScript load callback. If either image fails to load, the entire visual enhancement disappears and the saved exercise name and note still render. Each image is lazy-loaded, so generation never waits for media. The iOS Capacitor app uses the same hosted web UI and paths.

## Source, license, and delivery

The current stills are original Ascend illustrations with the app palette and Ascend watermark. Their PNG masters live in `docs/exercise-visual-source/ascend-original-v1/`, `ascend-original-v2/`, and `ascend-original-v3/`. The 97 app-ready 512×512 WebP files live in the corresponding directories under `frontend/public/exercise-visuals/` and total about 1.38 MiB. The registry uses 95 unique files and has 97 image references because High Plank shares the Push-Up start and Hanging Knee Raise shares the Pull-Up hanging start; the older Bird-Dog pair remains only for immutable-cache compatibility. Run `node scripts/prepare-ascend-exercise-visuals.mjs` from the repository root to regenerate all WebP versions from the local PNG masters.

Next.js serves the versioned Ascend files with `Cache-Control: public, max-age=31536000, immutable`. New or replaced artwork must use a **new versioned directory** so old browser caches never show stale poses. The previous pilot used 56 free [RepDB stills](https://github.com/RepDB/exercise-dataset) at commit `9ed9357f09c7566ea0256c57ebd6374ebb8b575e`; its [license](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md) and attribution applied to those former files. RepDB assets and attribution are no longer part of the active app. No RepDB dataset/API is exposed through Ascend's backend.

## Adding a future exercise

1. Confirm the exact Ascend name and variant from privacy-safe workout frequency data. Check equipment, written movement, and every proposed pose at full size against exercise guidance. Reject uncertain poses and near matches.
2. Retain the original PNG master and prepare a 512×512 WebP in a new versioned asset directory if artwork changes. Check the source rights and attribution for any future third-party asset.
3. Add one explicit registry record and only aliases that have been separately reviewed. Zoe's pilot-only preferred-name list is drawn from this registry; do not infer aliases from string similarity.
4. Add resolver mismatch tests, pair/single and asset-failure tests, check mobile sizing and source labeling, then run the full suite. Release only after normal review and QA.

## Aggregate telemetry

Migration `042_exercise_visual_pilot.sql` creates daily counters keyed by event type, safe exercise name, and registry ID. It stores **no user ID, workout ID, note, set/rep count, image, or health context**. Generation records `resolved`, `unresolved`, and `ambiguous` counts asynchronously. The authenticated UI may send only a known registry ID for `detail_opened`, `image_load_failure`, or `incorrect_mapping_report`; the endpoint is rate-limited. Names outside a conservative exercise-word allowlist are aggregated as `[redacted]`, so very novel unsupported names will not be individually readable. This is an intentional privacy tradeoff. Telemetry failure never blocks workout generation or viewing.

Visual coverage is `resolved / (resolved + unresolved + ambiguous)`. Review `incorrect_mapping_report` before expanding the registry. Low counts and repeated fallback workouts in the earlier audit mean pilot coverage estimates are directional, not representative of all members.

## 3 October 2026 form and coverage correction

The full 49-entry local visual registry was reviewed as paired or single poses. All 87 live WebP URLs returned the expected local bytes and `image/webp`; the missing cards came from unregistered exercise names and from the card's callback-dependent visibility. Recent privacy-safe pilot counters included unresolved Dumbbell Reverse Lunge, Seated Calf Raise (with dumbbell), Dumbbell Floor Glute Bridge, and Bench Incline Hamstring Stretch. The first three now have their own artwork. The fourth remains text-only because its precise bench setup is unclear from its name alone. Wall Push-Up has its own artwork as a distinct incline variant. Bird-Dog receives a new, clearer start/peak pair and explicit opposite-limb cue; the old versioned files stay untouched.

The added poses were checked against [ACE's Bird-Dog form steps](https://www.acefitness.org/resources/everyone/exercise-library/14/bird-dog/), [NASM's glute-bridge guidance](https://www.nasm.org/resource-center/blog/training/why-the-glute-bridge-belongs-in-almost-every-client-program), [NASM's seated calf-raise discussion](https://www.nasm.org/resource-center/blog/training/calf-training-how-to-program-this-stubborn-muscle-group-for-clients), and [NASM's push-up variations](https://www.nasm.org/resource-center/exercise-library/push-up). Zoe now names one precise movement per exercise instead of joining alternatives with “or” or “/”; the alternative can go in its note. Ambiguous names remain text-only unless the exact equipment and pose can be shown safely.
