# Ascend Stories V1

## Purpose

Ascend Stories turns a member's existing Progress Photos into a private, local 9:16 image they can choose to share. It is not a social feed and it does not publish anything automatically.

The member-facing entry point is **Progress Photos → Share Your Ascent**.

## Access and rollout

- Entitlement: inherits the existing Premium Progress Photos gate.
- Feature flag: `NEXT_PUBLIC_ASCEND_STORIES_V1`.
- Development and test: enabled automatically.
- Production: disabled unless `NEXT_PUBLIC_ASCEND_STORIES_V1=true` is explicitly configured.
- No database migration is required.
- Rollback: remove the production flag or revert the feature commit. Existing Progress Photos remain unchanged.

## Formats

- **Today** defaults to the latest available progress photo and lets the member select any authorised photo.
- **Then → Now** appears only when at least two photos are available. It defaults to the earliest and latest matching-angle photos, supports independent crop/position controls, blocks the same photo in both slots, and warns when the selected dates are reversed.
- **Earned** appears only when Ascend can verify an eligible milestone from existing records. When several verified achievements qualify, the member can choose which one to share.

Setup events and assignments are not treated as earned achievements. Goal completion, qualifying streaks, meaningful Ascend Memory events, workout milestones, and meal consistency can qualify.

## Styles

- **Loud** uses stronger brand colour and headline scale.
- **Cinematic** uses restrained contrast and an editorial treatment.
- **Quiet** minimizes decoration and reduces typography scale.

All formats use the canonical production asset at `/brand/ascend-mark-exact.png`.

## Privacy and data handling

- Source photos remain governed by the existing authenticated Progress Photos endpoint and Premium entitlement.
- The editor does not upload captions, crop settings, generated stories, or sharing destinations.
- Rendering happens locally in the browser/WebView with Canvas 2D.
- Exporting through Canvas produces a new PNG and does not preserve source EXIF metadata.
- Sensitive and behavioural metrics are hidden by default. A member must explicitly select each verified statistic before it appears.
- The optional **Made with Ascend** attribution can be disabled before export.
- When food history is paginated at the 100-record API limit, the story displays `100+` rather than presenting an incomplete count as exact.
- When workout history reaches the existing 100-record API limit, the story likewise displays `100+` rather than presenting the capped result as exact.
- No caption or metric is invented. Copy is deterministic and derived from verified dates, streaks, goal state, Ascend Memory, workout logs, meal logs, or progress comparison data already available to the member.
- No trainer, owner, or other member can create or retrieve a member's story through this feature.

## Export and sharing

- Output: PNG, exactly 1080 × 1920 pixels.
- Android/iOS native wrapper: the PNG is written to one replaceable app-cache path and sent with the member's edited caption to the operating-system share sheet through the official Capacitor Share plugin. The temporary file is deleted after the share sheet closes or is cancelled.
- Native Save Image: writes to `Documents/Ascend` through the official Capacitor Filesystem plugin.
- Web/PWA: uses the Web Share API with a PNG file when available; otherwise downloads the PNG.
- Sharing is always initiated by an explicit member action.

## Analytics event contract

The frontend currently has no product-analytics vendor abstraction. V1 therefore adds no SDK and sends no analytics request. It emits a local `ascend:analytics` custom event with privacy-safe operational properties only:

- `ascend_story_opened`
- `ascend_story_format_selected`
- `ascend_story_style_selected`
- `ascend_story_preview_generated`
- `ascend_story_share_sheet_opened`
- `ascend_story_image_saved`
- `ascend_story_generation_failed`
- `ascend_story_share_failed`

Allowed properties are `format`, `style`, and `platform`. Photo identifiers, URLs, captions, measurements, milestone text, and sharing destinations must never be added to this contract.

## Performance

- Story data is fetched only after the member opens the composer.
- Existing cached Ascend API functions are reused.
- The editor uses CSS transforms for previews and a single off-screen Canvas operation for export.
- Single-photo stories download the source image once; object URLs and the export canvas are released after use.
- No animation framework or continuous render loop is added.
- The milestone reveal is short, skippable, and static under `prefers-reduced-motion`.

## Validation checklist

- [x] Today, Then → Now, and Earned domain tests.
- [x] Earned eligibility excludes non-achievements.
- [x] Sensitive metrics hidden by default.
- [x] Crop bounds tested.
- [x] Export dimensions verified as 1080 × 1920 PNG.
- [x] Responsive visual QA at 360, 390, and 412 CSS pixels using synthetic fixtures only.
- [x] No horizontal overflow at required widths.
- [x] Web download fallback exercised.
- [x] Component tests cover photo selection, independent crops, visual styles, captions, attribution, statistics, save, cancellation, and web fallback.
- [x] Feature-flag and privacy-safe analytics contract tests.
- [x] Portrait, landscape, and square cover geometry tests confirm source aspect ratio is preserved.
- [x] Long unbroken captions are constrained to the export safe width.
- [x] Frontend suite: 5 files and 35 tests passed.
- [x] Backend regression suite: 39 files and 182 tests passed with an isolated non-routable `DATABASE_URL` supplied to satisfy environment parsing. No database connection was used.
- [x] Root lint and production build passed.
- [x] Capacitor Android sync and debug APK build passed with Share and Filesystem registered.
- [x] Representative local exports completed in approximately 0.83-1.54 seconds on the available Windows development environment. This is not a physical-device benchmark.
- [!] `npm audit --omit=dev` reports 13 existing production dependency advisories (5 high, 7 moderate, 1 low), including the repository's current Next.js and Firebase dependency trees. These were not introduced or upgraded in this focused feature branch.
- [ ] Android physical-device share sheet: release gate, NOT TESTED in this environment.
- [ ] Android physical-device Documents save: release gate, NOT TESTED in this environment.
- [ ] Instagram/TikTok receiving apps: release gate, NOT TESTED in this environment.
- [ ] iOS: NOT TESTED because this repository has no iOS native project.

## Manual release gate

Before enabling the production flag:

1. Install a build containing the Capacitor Share and Filesystem plugins on a physical Android device.
2. Open a Premium member's Progress Photos.
3. Export all three formats.
4. Confirm Share opens the Android share sheet with a PNG attachment.
5. Share to Instagram Stories and TikTok without cropping or corruption.
6. Confirm Save Image creates a readable file in `Documents/Ascend`.
7. Turn on Android's Reduce animations / remove animations setting and confirm the milestone reveal does not animate.
8. Confirm canceling the share sheet leaves the editor usable.
9. Confirm a Free member cannot bypass the existing Premium Progress Photos gate.

Production rollout remains blocked until the physical-device share tests pass.

`adb devices -l` found no connected emulator or physical device during this implementation, so no native destination is reported as passed.

## QA artifacts

Synthetic-only visual QA files are stored outside the repository at:

`C:\Users\Admin\Documents\Codex\artifacts\ascend-stories-v1`

The folder contains the 360, 390, and 412 pixel editor captures plus inspected Today, Then → Now, and Earned PNG exports. No member photos or production data were used.
