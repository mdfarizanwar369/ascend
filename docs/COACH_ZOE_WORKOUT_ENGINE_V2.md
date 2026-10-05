# Coach Zoe workout engine V2

V2 uses the existing Gemini workout call. It reads completed exercise names from recent `burn_log` events and names from recently generated plans, chooses a session locally from reviewed movements, and gives Gemini a compact session blueprint. The server enforces that blueprint after Gemini responds. Exercise swaps and the three-session roadmap use local logic; they do not call Gemini.

The reviewed prescription catalog has 79 movements. The Full Gym options now include leg curl, leg extension, two leg press formats, hack squat, shoulder press, chest fly, rear delt, supported row, hip abduction, calf raise, and cable variations. Forty-five and sixty minute muscle-gain sessions use accessory slots rather than repeating push/pull slots. The selector balances recent accessory targets, push/pull angles, and available equipment. Accessory swaps stay within the same target area. Every catalog entry has a local visual and coaching instructions; the new v6 machine visuals resolve only for V2 workouts until its public flag is enabled.

## Rollout

- `COACH_ZOE_WORKOUT_ENGINE_V2=false` and `COACH_ZOE_WORKOUT_ENGINE_V2_OWNER_PILOT=false` are the defaults. Existing users keep the V1 response and planner behavior.
- Set only `COACH_ZOE_WORKOUT_ENGINE_V2_OWNER_PILOT=true` for an owner-only pilot. The server must use `AI_PROVIDER=gemini`.
- Review exercise suitability, completed workout history, iOS daily saves and swaps, and Gemini usage per workout in the pilot before enabling `COACH_ZOE_WORKOUT_ENGINE_V2=true` for everyone.
- Set both flags back to `false` to roll back. Saved V2 workouts still display because their extra response fields are optional and versioned.

## Cost and data

Generation still makes one Gemini request. Swaps and refreshes use local alternatives. V2 sends a compact history and blueprint instead of the legacy broad context; it does not add a model, provider, database table, or background job. Exact provider billing may vary with request and response tokens, so usage should be compared during the owner pilot.

Completed workouts record exercise names and optional effort (`too_easy`, `about_right`, `too_hard`) in the existing event metadata. A checked Zoe plan is treated as a completed plan, not proof of performed sets or lifted weight. Web plans save only their prescribed exercise names in existing event storage; iOS daily plans are read from their existing saved workout rows. Planned exercises influence variety, but never count as completed training or trigger recovery. The next plan uses only recent completed-workout effort and rotates away from repeated movements. The roadmap is a preview that adapts after later workouts.

## Verification

Run shared build, backend TypeScript check, frontend lint, workout engine and Gemini provider tests, iOS daily workout tests, and the Coach Zoe UI test. Verify every catalog visual file exists and the V2-only images remain unresolved in legacy plans. Keep the public V2 flag off until the owner pilot has been reviewed.
