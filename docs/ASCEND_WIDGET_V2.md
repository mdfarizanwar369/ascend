# Ascend Widget V2

## Reversible release design

Widget V2 was started from the exact V1 source used by TestFlight build 182.1:

- V1 commit: `acc0b88d58ca51e3471bddbb98dc8832e84ae996`
- Local safety branch: `backup/widget-v1-testflight-182-1`
- V2 work branch: `codex/widget-v2-reversible`

V1 remains compiled in `ios/App/AscendWidget/AscendWidget.swift`. V2 is isolated in
`ios/App/AscendWidget/AscendWidgetV2.swift`.

The active design is selected by one line:

```swift
static let active: Self = .v2
```

Change that value to `.v1` to restore the V1 layouts and V1 supported widget
families in the next iOS build. No V1 source needs to be reconstructed.

Changing an already installed TestFlight or App Store build still requires a new
iOS build. The selector is intentionally local and does not add a remote flag,
background service, dependency, or paid infrastructure.

## Architecture findings

- The WidgetKit extension supports iOS 16 and uses `StaticConfiguration`.
- V1 supports small, medium, and accessory rectangular families. V2 adds large.
- The app and widget share `group.fit.getascend.app`.
- The app writes one JSON snapshot to `ascend.widget.today.v1` in shared
  `UserDefaults`; the widget performs no network requests.
- The timeline rereads the cache approximately every 30 minutes.
- Successful meal, water, manual movement, and Zoe workout saves dispatch a
  dashboard event. The native bridge fetches `/api/v1/siri/widget`, atomically
  stores the complete JSON value, and calls `WidgetCenter.reloadAllTimelines()`.
- App foreground and account reconciliation also refresh the snapshot.
- Deep links use `ascend://open?path=...` and are validated by the Capacitor URL
  router before navigating inside the authenticated app.
- Calories and hydration come from the same server-side totals and nutrition
  targets used by Ascend. Movement comes from recorded workouts and optional
  Apple Health data. Recovery comes from the daily recovery check-in.
- The authorized `AscendMark` and `ProgressPath` assets are bundled in the widget
  extension.

## V2 behavior

- The medium widget keeps calories as the stable primary metric.
- Hydration, movement, and recovery retain fixed positions.
- A deterministic message area uses current cached state and server priority.
- Missing calorie or hydration goals are not displayed as completed goals.
- Unavailable step data is displayed as unavailable rather than zero.
- Values from a previous local calendar day are hidden until Ascend refreshes.
- Cache data older than three hours is identified with a refresh message while
  preserving the last known values.
- Calorie and hydration rings clamp their rendered progress without changing the
  underlying displayed values.
- Food, water, movement, and recovery regions retain their existing deep links.
- Direct widget mutations were not added. Opening the existing validated log
  screen avoids duplicate entries and keeps server and cache state consistent.

## Refresh hardening

- Concurrent refresh requests are coalesced, with a final follow-up fetch when
  another relevant change arrives during an in-flight request.
- A response is discarded if the stored device credential changed while the
  request was in flight, preventing an old account response from repopulating
  the shared cache after sign-out or account switching.
- Removing meal, water, or movement entries now requests the same widget refresh
  as adding them.
- Cross-device changes still require Ascend to be opened. Widget V2 deliberately
  adds no background polling or push infrastructure.

## Preview fixtures

Xcode previews cover no data, partial goals, midday activity, completed goals,
long values, and unavailable recovery data at real WidgetKit family sizes.

## Release boundary

This branch is for implementation and validation. It must not be uploaded to
TestFlight or submitted to the App Store until the owner approves the rendered
device result.
