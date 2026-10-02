# Zoe exercise visual pilot

This is a 32-exercise, manually reviewed illustration pilot for Zoe Workout Builder. It augments the existing free-text workout objects; no saved record is rewritten, no new canonical exercise ID is required in workout storage, and Zoe's generation prompt remains unchanged. Mixed visual and text-only workouts are expected.

Production access fails closed behind `EXERCISE_VISUALS_ENABLED`. When enabled, access is limited to the platform owner plus the comma-separated user IDs in `EXERCISE_VISUALS_USER_IDS`. The server returns the verified access decision from `/me`; the UI never enables the pilot from a browser-only flag. Visual telemetry is also rejected for accounts outside the pilot.

## Approved artwork

The 19 candidates in the 2 October 2026 frequency audit were checked against their individual RepDB exercise pages and actual free WebP poses. The 14 approved movements are Bodyweight Squat, Glute Bridge, Child's Pose, Bird-Dog, Kneeling Hip Flexor Stretch, Dumbbell Romanian Deadlift, Standing Quad Stretch, Bodyweight Reverse Lunge, Dumbbell Bench Press, Dumbbell Floor Press, Dumbbell Shoulder Press, Bench Hamstring Stretch, Hanging Knee Raise, and Thread the Needle. Nine have a start/peak pair and five use one static pose. The Dumbbell Floor Press source filenames have their visual start/peak order reversed; the registry intentionally corrects the displayed order.

Five proposals were rejected after inspection and remain text-only:

| Candidate | Reason |
| --- | --- |
| Cat-Cow | The one still shows a neutral setup, not either spinal movement phase. |
| Walking | The one still adds little instructional value. |
| Step Ups | The supposed peak is mid-step with the foot in the air, rather than a stable finished position. |
| Scapular Pull Ups | The two poses barely distinguish the small scapular motion. |
| Lat Pulldown | The peak appears behind the neck although the written instruction says upper chest. |

Goblet Squat, generic Reverse Lunge, bent-knee Bench Dip, Downward Dog to Cobra, and generic Plank are also intentionally absent. A similar exercise with different equipment, body position, or movement phase is not a safe substitute.

### Common-movement expansion

The next 18 approved variants are Push-Up, Knee Push-Up, Jumping Jacks, Crunch, Dead Bug, High Plank, Forearm Side Plank, Wall Sit, Bodyweight Walking Lunge, Machine Chest Press, Seated Cable Row, 45-Degree Leg Press, Dumbbell Lateral Raise, Dumbbell Bicep Curl, Pull-Up, Machine-Assisted Pull-Up, Bent-Over Dumbbell Row, and Straight-Bar Cable Triceps Pushdown. Each RepDB record and its free images were inspected individually. The standard Push-Up source files label the lowered pose as `start.webp`; the registry displays the high plank first and the lowered pose second.

This expansion is based on the common squat, lunge, push, pull, and core movements illustrated in [ACE's beginner workout guide](https://www.acefitness.org/resources/pros/expert-articles/5248/total-body-workout-for-beginners/), [ACE's bodyweight workout builder](https://www.acefitness.org/continuing-education/certified/december-2024/8763/the-ace-body-weight-workout-builder/), Ascend's gym fallback and capture fixtures, and matching free [RepDB records](https://github.com/RepDB/exercise-dataset). Fallback and fixture names are representative product inputs, **not measured Zoe generation frequency**. The earlier 103 observed exercise slots remain the only measured sample; the expansion does not establish a new coverage percentage for that sample or for all members.

Two additional candidate visuals were rejected: Wall Push-Ups, because the images omit the wall that defines the movement, and Barbell Bench Press, because the lowered image places the bar near the neck rather than mid-chest. Both stay text-only. Generic Side Plank, Walking Lunge, Leg Press, Assisted Pull-Up, and Cable Triceps Pushdown are also text-only: the selected images show a forearm hold, bodyweight lunge, 45-degree sled, assisted machine, and straight-bar cable attachment respectively, while those generic names do not establish the variant. The registry does not substitute another exercise's picture.

## Structure and rules

`shared/src/exerciseVisuals.ts` is the complete allowlist. Each entry has a stable Ascend ID, canonical name, approved aliases, equipment, movement pattern, target muscles, RepDB ID, local image paths, and reviewed short coaching text. `resolveExerciseVisual` compares only exact names and explicit aliases after case, whitespace, and curly-apostrophe normalization. It makes no semantic, AI, equipment, or fuzzy inference. Known ambiguous names are marked `ambiguous`; everything else is `unresolved`. Both keep the original text-only card. Existing exercise notes always remain visible when expanded.

The expanded card provides the visual, equipment, target muscles, instructions, cue, a reporting control, and visible [Exercise data by RepDB](https://repdb.co) attribution. Slow images have a labeled loading state rather than a blank frame. If either image fails to load, the entire visual enhancement disappears and the saved exercise name and note still render. Each image is lazy-loaded, so generation never waits for media. The iOS Capacitor app uses the same hosted web UI and paths.

## Source, license, and delivery

The approved stills come from the free [RepDB exercise dataset](https://github.com/RepDB/exercise-dataset) at commit `9ed9357f09c7566ea0256c57ebd6374ebb8b575e`. [RepDB's data license](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md) allows commercial in-app use of the free stills with visible attribution; it does not allow republishing the collection as a dataset, generative derivative images, or use of evaluation-only animations. Only the 56 approved free WebP files are included. No RepDB dataset/API is exposed through Ascend's backend.

Assets live under `frontend/public/exercise-visuals/repdb-free-9ed9357/` (about 840 KB total). Next.js serves them with `Cache-Control: public, max-age=31536000, immutable`. New or replaced artwork must use a **new versioned directory** so old browser caches never show stale poses. The current individual exercise IDs correspond to `https://exercise-dataset.com/exercise/<repdbId>/`.

## Adding a future exercise

1. Confirm the exact Ascend name and variant from privacy-safe workout frequency data. Inspect RepDB's exercise page, equipment, written movement and every proposed image at full size. Reject uncertain poses and near matches.
2. Confirm the source license is still suitable. Download only approved free stills, retain their provenance, and put them in a new versioned asset directory if any artwork changes.
3. Add one explicit registry record and only aliases that have been separately reviewed. Do not modify Zoe's prompt or infer aliases from string similarity.
4. Add resolver mismatch tests, pair/single and asset-failure tests, check mobile sizing and attribution, then run the full suite. Release only after normal review and QA.

## Aggregate telemetry

Migration `042_exercise_visual_pilot.sql` creates daily counters keyed by event type, safe exercise name, and registry ID. It stores **no user ID, workout ID, note, set/rep count, image, or health context**. Generation records `resolved`, `unresolved`, and `ambiguous` counts asynchronously. The authenticated UI may send only a known registry ID for `detail_opened`, `image_load_failure`, or `incorrect_mapping_report`; the endpoint is rate-limited. Names outside a conservative exercise-word allowlist are aggregated as `[redacted]`, so very novel unsupported names will not be individually readable. This is an intentional privacy tradeoff. Telemetry failure never blocks workout generation or viewing.

Visual coverage is `resolved / (resolved + unresolved + ambiguous)`. Review `incorrect_mapping_report` before expanding the registry. Low counts and repeated fallback workouts in the earlier audit mean pilot coverage estimates are directional, not representative of all members.
