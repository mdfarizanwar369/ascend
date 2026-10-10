import SwiftUI
import WidgetKit

private let ascendTeal = Color(red: 0.21, green: 0.95, blue: 0.82)
private let ascendBlue = Color(red: 0.20, green: 0.55, blue: 0.96)
private let ascendViolet = Color(red: 0.64, green: 0.40, blue: 1.00)

struct AscendWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: AscendWidgetSnapshot?
}

struct AscendWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> AscendWidgetEntry {
        .init(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (AscendWidgetEntry) -> Void) {
        completion(.init(date: Date(), snapshot: context.isPreview ? .placeholder : AscendWidgetStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AscendWidgetEntry>) -> Void) {
        let now = Date()
        completion(.init(entries: [.init(date: now, snapshot: AscendWidgetStore.load())],
                         policy: .after(now.addingTimeInterval(30 * 60))))
    }
}

private func ascendURL(_ path: String) -> URL {
    var components = URLComponents()
    components.scheme = "ascend"
    components.host = "open"
    components.queryItems = [URLQueryItem(name: "path", value: path)]
    return components.url!
}

private struct AscendBackground: View {
    var body: some View {
        ZStack {
            Image("ProgressPath")
                .resizable()
                .scaledToFill()
            LinearGradient(colors: [Color(red: 0.02, green: 0.05, blue: 0.11).opacity(0.58),
                                    Color(red: 0.02, green: 0.05, blue: 0.11).opacity(0.94)],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        }
    }
}

private extension View {
    @ViewBuilder func ascendWidgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { AscendBackground() }
        } else {
            background(AscendBackground())
        }
    }
}

private struct AscendBrand: View {
    let compact: Bool
    var body: some View {
        HStack(spacing: compact ? 5 : 7) {
            Image("AscendMark")
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 16 : 20, height: compact ? 16 : 20)
            Text("ASCEND")
                .font(.system(size: compact ? 9 : 11, weight: .semibold, design: .rounded))
                .tracking(compact ? 2.0 : 2.8)
                .foregroundStyle(.white)
        }
    }
}

private struct CalorieRing: View {
    let snapshot: AscendWidgetSnapshot
    let diameter: CGFloat
    private var progress: Double {
        guard snapshot.calories.target > 0 else { return 0 }
        return min(1, max(0, Double(snapshot.calories.logged) / Double(snapshot.calories.target)))
    }

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.10), lineWidth: diameter * 0.105)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(AngularGradient(colors: [ascendViolet, ascendBlue, ascendTeal], center: .center),
                        style: StrokeStyle(lineWidth: diameter * 0.105, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Image(systemName: "flame.fill")
                .font(.system(size: diameter * 0.25, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: ascendViolet.opacity(0.7), radius: 8)
        }
        .frame(width: diameter, height: diameter)
    }
}

private struct MetricTile: View {
    let icon: String
    let color: Color
    let value: String
    let label: String
    let path: String

    var body: some View {
        Link(destination: ascendURL(path)) {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(color)
                Text(value)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Text(label)
                    .font(.system(size: 8, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct AscendMediumWidget: View {
    let snapshot: AscendWidgetSnapshot?

    private var dayLabel: String {
        Date().formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    var body: some View {
        if let snapshot {
            GeometryReader { geometry in
                VStack(spacing: 4) {
                    HStack {
                        AscendBrand(compact: true)
                        Spacer()
                        Text(dayLabel)
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.70))
                    }
                    .frame(height: 18)
                    Link(destination: ascendURL("/food-log")) {
                        HStack(spacing: 11) {
                            CalorieRing(snapshot: snapshot, diameter: 50)
                            VStack(alignment: .leading, spacing: -2) {
                                Text(snapshot.calories.remaining.formatted())
                                    .font(.system(size: 30, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)
                                    .contentTransition(.numericText())
                                Text("kcal left")
                                    .font(.system(size: 14, weight: .regular, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.78))
                            }
                            Spacer()
                        }
                    }
                    .frame(height: 50)
                    Divider().overlay(Color.white.opacity(0.12))
                    HStack(spacing: 0) {
                        MetricTile(icon: "drop", color: ascendBlue,
                                   value: String(format: "%.1f L", Double(snapshot.water.remainingMl) / 1000),
                                   label: "water left", path: "/water-log")
                        Divider().overlay(Color.white.opacity(0.10))
                        MetricTile(icon: snapshot.movement.workoutCompleted ? "checkmark.circle.fill" : "figure.walk",
                                   color: ascendTeal,
                                   value: snapshot.movement.workoutCompleted ? "Done" : snapshot.movement.steps.formatted(.number.notation(.compactName)),
                                   label: snapshot.movement.workoutCompleted ? "movement" : "steps", path: "/burn-log")
                        Divider().overlay(Color.white.opacity(0.10))
                        MetricTile(icon: "moon.fill", color: ascendViolet,
                                   value: snapshot.recovery.sleepQuality?.capitalized ?? "Check in",
                                   label: "recovery", path: "/dashboard")
                    }
                    .frame(height: 42)
                    if geometry.size.height >= 162 {
                        Text("“Small steps. A better you.”")
                            .font(.system(size: 9, weight: .medium, design: .rounded).italic())
                            .foregroundStyle(.white.opacity(0.66))
                            .lineLimit(1)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            }
            .privacySensitive()
            .ascendWidgetBackground()
        } else {
            AscendEmptyWidget(compact: false)
        }
    }
}

private struct AscendSmallWidget: View {
    let snapshot: AscendWidgetSnapshot?
    var body: some View {
        if let snapshot {
            Link(destination: ascendURL("/food-log")) {
                VStack(alignment: .leading, spacing: 7) {
                    AscendBrand(compact: true)
                    Spacer(minLength: 0)
                    HStack(spacing: 9) {
                        CalorieRing(snapshot: snapshot, diameter: 48)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(snapshot.calories.remaining.formatted())
                                .font(.system(size: 25, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                            Text("kcal left")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.white.opacity(0.70))
                        }
                    }
                    Spacer(minLength: 0)
                    HStack {
                        Label(String(format: "%.1f L", Double(snapshot.water.remainingMl) / 1000), systemImage: "drop")
                        Spacer()
                        Label(snapshot.movement.workoutCompleted ? "Done" : snapshot.movement.steps.formatted(.number.notation(.compactName)), systemImage: "figure.walk")
                    }
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.82))
                }
                .padding(13)
            }
            .privacySensitive()
            .ascendWidgetBackground()
        } else {
            AscendEmptyWidget(compact: true)
        }
    }
}

private struct AscendAccessoryWidget: View {
    let snapshot: AscendWidgetSnapshot?
    var body: some View {
        HStack(spacing: 8) {
            Image("AscendMark").resizable().scaledToFit().frame(width: 22, height: 22).widgetAccentable()
            if let snapshot {
                VStack(alignment: .leading, spacing: 1) {
                    Text("ASCEND").font(.caption2.weight(.bold)).tracking(1.5)
                    Text("\(snapshot.calories.remaining.formatted()) kcal left").font(.headline)
                }
            } else {
                VStack(alignment: .leading, spacing: 1) {
                    Text("ASCEND").font(.caption2.weight(.bold)).tracking(1.5)
                    Text("Open to connect").font(.headline)
                }
            }
        }
        .privacySensitive()
        .widgetURL(ascendURL("/dashboard"))
    }
}

private struct AscendEmptyWidget: View {
    let compact: Bool
    var body: some View {
        Link(destination: ascendURL("/dashboard")) {
            VStack(alignment: .leading, spacing: 9) {
                AscendBrand(compact: compact)
                Spacer()
                Image(systemName: "arrow.up.forward.app")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(ascendTeal)
                Text("Open Ascend")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Sign in once to show today’s progress here.")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.68))
                    .lineLimit(compact ? 3 : 2)
            }
            .padding(compact ? 13 : 15)
        }
        .ascendWidgetBackground()
    }
}

private struct AscendWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AscendWidgetEntry

    var body: some View {
        switch family {
        case .systemMedium: AscendMediumWidget(snapshot: entry.snapshot)
        case .accessoryRectangular: AscendAccessoryWidget(snapshot: entry.snapshot)
        default: AscendSmallWidget(snapshot: entry.snapshot)
        }
    }
}

struct AscendTodayWidget: Widget {
    let kind = "AscendTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AscendWidgetProvider()) { entry in
            AscendWidgetView(entry: entry)
        }
        .configurationDisplayName("Ascend Today")
        .description("See calories, water, movement and recovery at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}
