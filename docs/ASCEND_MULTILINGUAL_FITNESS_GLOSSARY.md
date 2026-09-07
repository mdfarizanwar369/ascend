# Ascend multilingual fitness glossary

This glossary defines the translation policy for recurring Ascend fitness, nutrition, coaching, and product terms across English, Bahasa Melayu, and Simplified Chinese.

## Product terms

| English | Bahasa Melayu policy | Simplified Chinese policy | Notes |
| --- | --- | --- | --- |
| Ascend | Keep as `Ascend` | Keep as `Ascend` | Brand name. |
| Coach Zoe | Keep as `Coach Zoe` | Keep as `Coach Zoe` | Product persona name; do not translate Zoe. |
| Ascend Coach | Keep as `Ascend Coach` | Keep as `Ascend Coach` | Trainer product line. |
| Client 360 | Keep as `Client 360` | Keep as `Client 360` | Product feature name. |
| Trainer | Usually keep `trainer` | Usually keep `trainer` | Malaysian/Singapore fitness users commonly understand this. Use local explanation only in longer helper text. |
| Coach | Usually keep `Coach` | Use `教练` when generic, keep `Coach Zoe` for product | Avoid over-formal Malay. |
| Owner / Admin / Platform Owner | Keep role names in English in role badges | Keep role names in English in role badges | These map to RBAC concepts; translate surrounding copy, not identifiers. |

## Training terms

| English | Bahasa Melayu policy | Simplified Chinese policy | Notes |
| --- | --- | --- | --- |
| Workout | Usually keep `workout` | Usually keep `workout` in feature names; `训练` in natural sentences | Existing Ascend tone is fitness-app casual. |
| Exercise | `exercise` or `latihan` depending context | `动作` or `训练动作` | Do not translate specific exercise names unless there is a familiar local equivalent. |
| Sets | `set` | `组` | Keep concise in controls. |
| Reps | `rep` / `reps` | `次数` | Retain `reps` where space is tight. |
| RPE | Keep `RPE` with explanation | Keep `RPE` with explanation | Abbreviation is more precise. |
| RIR | Keep `RIR` with explanation | Keep `RIR` with explanation | Abbreviation is more precise. |
| Tempo | `tempo` | `节奏` or `tempo` | Use `tempo` in prescription tables. |
| Rest | `rehat` | `休息` | Natural UI label. |
| Warm-up | `warm-up` | `热身` | Malay users commonly understand warm-up. |
| Cooldown | `cooldown` | `放松` | Avoid awkward literal Malay. |
| Progressive overload | `progressive overload` with helper explanation | `渐进超负荷` with helper explanation | Keep technical concept accurate. |
| Failure | `failure` / `gagal lengkap rep` depending context | `力竭` | Avoid implying injury or medical failure. |

## Nutrition and body terms

| English | Bahasa Melayu policy | Simplified Chinese policy | Notes |
| --- | --- | --- | --- |
| kcal | Keep `kcal` | Keep `kcal` | Unit, not translated. |
| Calories | `kalori` | `calories` or `热量` | Use `calories` in compact macro cards if consistent with app tone. |
| Protein | `protein` | `protein` or `蛋白质` | Keep `protein` in compact macro UI. |
| Carbohydrates / carbs | `karbo` | `碳水` | Short, natural fitness-app terms. |
| Fat | `lemak` | `脂肪` | Natural label. |
| Macros | `makro` | `macros` / `宏量营养` | Use `macros` in casual UI; explain in onboarding/help copy. |
| Body Scan | Keep `Body Scan` | Keep `Body Scan` in feature names | Product capability. |
| Body fat | `body fat` or `lemak badan` | `体脂` | Prefer consistent body-composition phrasing. |
| Lean mass | `lean mass` with explanation | `瘦体重` | Avoid overclaiming scan precision. |
| BMI | Keep `BMI` | Keep `BMI` | Add explanation where needed. |
| VO₂ Max | Keep `VO₂ Max` | Keep `VO₂ Max` | Scientific term; do not localize unit. |

## Exercise names

Specific exercise names such as `Romanian Deadlift`, `Bulgarian Split Squat`, `Bench Press`, `Lat Pulldown`, and `Hip Thrust` should remain in English by default. These are common gym terms and map more reliably to exercise identity than translated names. If a screen needs explanation, show the English exercise name first and a short localized explanation second.

## Legal and consent copy

The English legal documents remain the controlling version unless reviewed translated legal text is explicitly approved. Malay and Chinese legal text should be presented as convenience translation only, with clear wording that the English version controls.

## Style guardrails

- Bahasa Melayu should sound like natural Malaysian app copy, not Indonesian or bureaucratic Malay.
- Simplified Chinese should use Simplified characters and natural Singapore/Malaysia fitness-app phrasing.
- Do not translate database enum values, permission keys, analytics names, API error codes, or RBAC identifiers.
- Do not use AI summaries as source text for translations without human/product review.
