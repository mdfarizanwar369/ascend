# Ascend Multilingual Foundation

Ascend supports the following application locales:

- `en` - English
- `ms-MY` - Bahasa Melayu for Malaysian users
- `zh-Hans` - Simplified Chinese

The locale contract lives in `shared/src/locale.ts`. Keep internal database enums, permission identifiers, analytics events, route names, and code identifiers in English. Only user-facing presentation copy should be translated.

## Architecture

Frontend translation catalogs live in `frontend/src/lib/i18n/messages.ts`. Components call `useI18n()` and render keys with `t("namespace.key")`. English is the fallback language; if a key is missing in the selected locale, the provider falls back to `messages.en`.

Do not add ad hoc conditionals such as `locale === "ms-MY" ? "..." : "..."`. Add a key to every locale instead.

The root app wraps all routes with `I18nProvider`. The provider:

- reads the last local locale from `localStorage` for logged-out screens,
- refreshes from `/me` after sign-in,
- updates `document.documentElement.lang`,
- persists changes through `PATCH /me/language`.

## Adding A Translation Key

1. Add an English key in `frontend/src/lib/i18n/messages.ts`.
2. Add natural Malaysian Bahasa Melayu for `ms-MY`.
3. Add natural Simplified Chinese for `zh-Hans`.
4. Use `const { t } = useI18n()` in the component.
5. Render `t("your.namespace.key")`.
6. Run `npm run i18n:audit`.

## Adding A New Screen

Use a feature namespace that matches the user workflow, for example:

- `auth.*`
- `dashboard.*`
- `workout.*`
- `nutrition.*`
- `progress.*`
- `trainer.*`
- `admin.*`
- `account.*`

Short generic labels can live under `common.*`.

## Adding A Fourth Language

1. Add the locale code to `ASCEND_LOCALES`.
2. Add the display label to `ASCEND_LOCALE_LABELS`.
3. Add the database check value in a new additive migration.
4. Add a complete message catalog.
5. Update AI language instructions in `backend/src/integrations/openai.ts`.
6. Run the translation-key audit and major journey validation.

## AI Locale

Zoe and workout-generation prompts receive the account locale as structured context and a concise language instruction. Do not duplicate full prompts per language. Keep health, nutrition, and exercise terms precise. In Malay and Chinese, retain common terms such as workout, reps, sets, calories, protein, RPE, BMI, VO2 max, and established exercise names where English is clearer.

## Fitness Terminology

Do not blindly translate exercise names. Terms such as Romanian Deadlift, Bulgarian Split Squat, Bench Press, Lat Pulldown, Hip Thrust, RPE, BMI, calories, protein, sets, and reps may remain English when that is the more familiar fitness-language choice for Malaysian users.

The detailed policy lives in `docs/ASCEND_MULTILINGUAL_FITNESS_GLOSSARY.md`.

## Audits

Run:

```bash
npm run i18n:audit
```

The audit checks:

- missing translation keys in English, Malay, and Chinese,
- duplicate English catalog keys,
- high-confidence hardcoded user-facing frontend strings,
- lower-confidence review warnings.

Missing keys, duplicate English keys, and high-confidence hardcoded strings fail the audit. Lower-confidence findings are reported for review without failing CI. This means `npm run i18n:audit` is expected to fail until the remaining production surfaces are fully migrated.
