import SwiftUI
import WidgetKit

private enum AscendWidgetV2Tokens {
    static var theme: AscendWidgetTheme { AscendWidgetThemeStore.load() }

    static var navy: Color {
        switch theme {
        case .classic: return Color(red: 0.015, green: 0.035, blue: 0.075)
        case .light: return Color(red: 0.95, green: 0.97, blue: 0.98)
        case .gymGirl: return Color(red: 0.16, green: 0.015, blue: 0.065)
        case .cuteLift: return Color(red: 1.0, green: 0.98, blue: 0.92)
        case .iron: return Color(red: 0.025, green: 0.03, blue: 0.035)
        case .summit: return Color(red: 0.015, green: 0.13, blue: 0.11)
        }
    }
    static var teal: Color {
        switch theme {
        case .classic: return Color(red: 0.12, green: 0.94, blue: 0.80)
        case .light: return Color(red: 0.0, green: 0.54, blue: 0.46)
        case .gymGirl: return Color(red: 1.0, green: 0.36, blue: 0.60)
        case .cuteLift: return Color(red: 0.0, green: 0.64, blue: 0.55)
        case .iron: return Color(red: 1.0, green: 0.52, blue: 0.17)
        case .summit: return Color(red: 0.63, green: 0.82, blue: 0.59)
        }
    }
    static var blue: Color {
        switch theme {
        case .classic: return Color(red: 0.18, green: 0.64, blue: 1.0)
        case .light: return Color(red: 0.1, green: 0.47, blue: 0.78)
        case .gymGirl: return Color(red: 1.0, green: 0.55, blue: 0.74)
        case .cuteLift: return Color(red: 0.0, green: 0.63, blue: 0.78)
        case .iron: return Color(red: 0.94, green: 0.46, blue: 0.12)
        case .summit: return Color(red: 0.70, green: 0.88, blue: 0.73)
        }
    }
    static var violet: Color {
        switch theme {
        case .classic: return Color(red: 0.62, green: 0.38, blue: 1.0)
        case .light: return Color(red: 0.46, green: 0.28, blue: 0.76)
        case .gymGirl: return Color(red: 0.97, green: 0.33, blue: 0.74)
        case .cuteLift: return Color(red: 0.56, green: 0.39, blue: 0.82)
        case .iron: return Color(red: 1.0, green: 0.70, blue: 0.35)
        case .summit: return Color(red: 0.98, green: 0.82, blue: 0.48)
        }
    }
    static var primaryText: Color { theme == .cuteLift || theme == .light ? Color(red: 0.10, green: 0.12, blue: 0.25) : .white }
    static var secondaryText: Color {
        switch theme {
        case .classic: return Color(red: 0.72, green: 0.78, blue: 0.88)
        case .light: return Color(red: 0.35, green: 0.40, blue: 0.47)
        case .cuteLift: return Color(red: 0.34, green: 0.31, blue: 0.47)
        default: return Color(red: 0.79, green: 0.82, blue: 0.86)
        }
    }
    static var glass: Color {
        switch theme {
        case .classic: return Color(red: 0.035, green: 0.075, blue: 0.13).opacity(0.78)
        case .light: return Color.white.opacity(0.88)
        case .cuteLift: return Color.white.opacity(0.84)
        default: return navy.opacity(0.82)
        }
    }
    static var hairline: Color { primaryText.opacity(theme == .classic || theme == .cuteLift || theme == .light ? 0.12 : 0.18) }
    static var backgroundAsset: String {
        switch theme {
        case .classic: return "ProgressPath"
        case .light: return "ProgressPath"
        case .gymGirl: return "GymGirlBackground"
        case .cuteLift: return "CuteLiftBackground"
        case .iron: return "IronBackground"
        case .summit: return "SummitBackground"
        }
    }
}

private func ascendV2URL(_ path: String) -> URL {
    var components = URLComponents()
    components.scheme = "ascend"
    components.host = "open"
    components.queryItems = [URLQueryItem(name: "path", value: path)]
    return components.url!
}

private let ascendV2RecoveryPath = "/dashboard?panel=recovery&source=widget"

private enum AscendWidgetFreshness: Equatable {
    case current
    case stale
    case previousDay
}

private struct AscendWidgetV2State {
    let snapshot: AscendWidgetSnapshot
    let now: Date
    let freshness: AscendWidgetFreshness

    init(snapshot: AscendWidgetSnapshot, now: Date) {
        self.snapshot = snapshot
        self.now = now
        let formatter = DateFormatter()
        formatter.calendar = .autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        if snapshot.localDate.isEmpty && snapshot.generatedAt.isEmpty {
            freshness = .current
        } else if snapshot.localDate != formatter.string(from: now) {
            freshness = .previousDay
        } else if let generated = Self.parseServerDate(snapshot.generatedAt), now.timeIntervalSince(generated) > 3 * 60 * 60 {
            freshness = .stale
        } else {
            freshness = .current
        }
    }

    private static func parseServerDate(_ value: String) -> Date? {
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = precise.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }

    var calorieProgress: Double? {
        guard snapshot.calories.target > 0 else { return nil }
        return min(1, max(0, Double(snapshot.calories.logged) / Double(snapshot.calories.target)))
    }

    var calorieValue: String {
        guard freshness != .previousDay else { return "--" }
        if snapshot.calories.target <= 0 { return snapshot.calories.logged.formatted() }
        if snapshot.calories.logged > snapshot.calories.target {
            return (snapshot.calories.logged - snapshot.calories.target).formatted()
        }
        return snapshot.calories.remaining.formatted()
    }

    var calorieLabel: String {
        guard freshness != .previousDay else { return "refresh needed" }
        if snapshot.calories.target <= 0 { return "kcal logged" }
        return snapshot.calories.logged > snapshot.calories.target ? "kcal over" : "kcal left"
    }

    var waterValue: String {
        guard freshness != .previousDay else { return "--" }
        guard snapshot.water.targetMl > 0 else {
            return snapshot.water.loggedMl > 0 ? Self.litres(snapshot.water.loggedMl) : "Not set"
        }
        return snapshot.water.remainingMl == 0 ? "Goal met" : Self.litres(snapshot.water.remainingMl)
    }

    var waterLabel: String {
        if freshness == .previousDay { return "water" }
        if snapshot.water.targetMl <= 0 { return snapshot.water.loggedMl > 0 ? "water logged" : "water goal" }
        return snapshot.water.remainingMl == 0 ? "hydration" : "water left"
    }

    var movementValue: String {
        guard freshness != .previousDay else { return "--" }
        if snapshot.movement.workoutCompleted { return "Done" }
        if snapshot.movement.hasMeasuredSteps {
            return snapshot.movement.steps.formatted(.number.notation(.compactName))
        }
        return "No data"
    }

    var movementLabel: String {
        if freshness == .previousDay { return "movement" }
        if snapshot.movement.workoutCompleted { return "workout" }
        return snapshot.movement.hasMeasuredSteps ? "steps" : "movement"
    }

    var movementIcon: String {
        if freshness == .previousDay { return "figure.walk" }
        return snapshot.movement.workoutCompleted ? "checkmark.circle.fill" : "figure.walk"
    }

    var recoveryValue: String {
        guard freshness != .previousDay else { return "--" }
        return snapshot.recovery.sleepQuality?.capitalized ?? "Check in"
    }

    var recoveryLabel: String { "recovery" }

    private static func litres(_ millilitres: Int) -> String {
        String(format: "%.1f L", Double(max(0, millilitres)) / 1000)
    }
}

private struct AscendWidgetMessage {
    let text: String
    let path: String
    let icon: String
    let color: Color
}

private enum AscendWidgetDecisionEngine {
    static func message(for state: AscendWidgetV2State) -> AscendWidgetMessage {
        switch state.freshness {
        case .previousDay:
            return .init(text: "Open Ascend to refresh today’s progress", path: "/dashboard", icon: "arrow.clockwise", color: AscendWidgetV2Tokens.blue)
        case .stale:
            return .init(text: "Open Ascend for the latest totals", path: "/dashboard", icon: "clock.arrow.circlepath", color: AscendWidgetV2Tokens.blue)
        case .current:
            break
        }

        let snapshot = state.snapshot
        let hydrationComplete = snapshot.water.targetMl > 0 && snapshot.water.loggedMl >= snapshot.water.targetMl
        let recoveryComplete = snapshot.recovery.sleepQuality != nil

        if hydrationComplete && snapshot.movement.workoutCompleted && recoveryComplete {
            return .init(text: "Today’s essentials are complete", path: "/progress", icon: "checkmark.seal.fill", color: AscendWidgetV2Tokens.teal)
        }

        if !snapshot.priority.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let presentation = priorityPresentation(snapshot.priority.key)
            return .init(text: snapshot.priority.title, path: safePath(snapshot.priority.href), icon: presentation.icon, color: presentation.color)
        }

        if hydrationComplete {
            return .init(text: "Hydration goal completed", path: "/water-log", icon: "drop.fill", color: AscendWidgetV2Tokens.teal)
        }

        if !recoveryComplete && Calendar.autoupdatingCurrent.component(.hour, from: state.now) >= 18 {
            return .init(text: "Recovery check-in is ready", path: ascendV2RecoveryPath, icon: "moon.stars.fill", color: AscendWidgetV2Tokens.violet)
        }

        return .init(text: "Your daily progress is ready", path: "/dashboard", icon: "sparkles", color: AscendWidgetV2Tokens.teal)
    }

    private static func priorityPresentation(_ key: String?) -> (icon: String, color: Color) {
        switch key {
        case "Water": return ("drop.fill", AscendWidgetV2Tokens.blue)
        case "Movement": return ("figure.walk", AscendWidgetV2Tokens.teal)
        case "Meal": return ("fork.knife", AscendWidgetV2Tokens.violet)
        default: return ("sparkles", AscendWidgetV2Tokens.teal)
        }
    }

    private static func safePath(_ value: String) -> String {
        guard value.hasPrefix("/"), !value.hasPrefix("//") else { return "/dashboard" }
        return value
    }
}

private struct AscendV2Background: View {
    var body: some View {
        ZStack {
            AscendWidgetV2Tokens.navy
            if AscendWidgetV2Tokens.theme != .light {
                Image(AscendWidgetV2Tokens.backgroundAsset)
                    .resizable()
                    .scaledToFill()
                    .saturation(AscendWidgetV2Tokens.theme == .classic ? 0.78 : 1)
                    .contrast(AscendWidgetV2Tokens.theme == .classic ? 1.08 : 1)
            }
            if AscendWidgetV2Tokens.theme == .classic {
                LinearGradient(
                    colors: [Color.black.opacity(0.32), AscendWidgetV2Tokens.navy.opacity(0.72), AscendWidgetV2Tokens.navy.opacity(0.96)],
                    startPoint: .topTrailing,
                    endPoint: .bottomLeading
                )
                RadialGradient(
                    colors: [AscendWidgetV2Tokens.blue.opacity(0.20), Color.clear],
                    center: .topTrailing,
                    startRadius: 4,
                    endRadius: 180
                )
            } else if AscendWidgetV2Tokens.theme == .light {
                RadialGradient(colors: [AscendWidgetV2Tokens.teal.opacity(0.13), .clear], center: .topTrailing, startRadius: 10, endRadius: 210)
            } else if AscendWidgetV2Tokens.theme == .cuteLift {
                LinearGradient(colors: [AscendWidgetV2Tokens.navy.opacity(0.36), .clear], startPoint: .leading, endPoint: .trailing)
            } else {
                LinearGradient(colors: [AscendWidgetV2Tokens.navy.opacity(0.70), AscendWidgetV2Tokens.navy.opacity(0.16)], startPoint: .leading, endPoint: .trailing)
                LinearGradient(colors: [.clear, AscendWidgetV2Tokens.navy.opacity(0.66)], startPoint: .top, endPoint: .bottom)
            }
        }
    }
}

private extension View {
    @ViewBuilder func ascendV2Background() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { AscendV2Background() }
        } else {
            background(AscendV2Background())
        }
    }
}

private struct AscendV2Brand: View {
    let compact: Bool

    var body: some View {
        HStack(spacing: compact ? 5 : 7) {
            Image("AscendMark")
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 16 : 20, height: compact ? 16 : 20)
            Text("ASCEND")
                .font(.system(size: compact ? 9 : 11, weight: .semibold, design: .rounded))
                .tracking(compact ? 2.0 : 2.7)
                .foregroundStyle(AscendWidgetV2Tokens.primaryText)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ascend")
    }
}

private struct AscendV2CalorieRing: View {
    let progress: Double?
    let diameter: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(AscendWidgetV2Tokens.primaryText.opacity(0.12), lineWidth: max(5, diameter * 0.095))
            if let progress {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        AngularGradient(colors: [AscendWidgetV2Tokens.violet, AscendWidgetV2Tokens.blue, AscendWidgetV2Tokens.teal], center: .center),
                        style: StrokeStyle(lineWidth: max(5, diameter * 0.095), lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
            } else {
                Circle()
                    .trim(from: 0, to: 0.18)
                    .stroke(AscendWidgetV2Tokens.secondaryText.opacity(0.45), style: StrokeStyle(lineWidth: max(5, diameter * 0.095), lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Image(systemName: "flame.fill")
                .font(.system(size: diameter * 0.24, weight: .semibold))
                .foregroundStyle(AscendWidgetV2Tokens.primaryText)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true)
    }
}

private struct AscendV2Metric: View {
    let icon: String
    let color: Color
    let value: String
    let label: String
    let path: String
    var roomy = false

    var body: some View {
        Link(destination: ascendV2URL(path)) {
            VStack(alignment: roomy ? .leading : .center, spacing: roomy ? 5 : 2) {
                Image(systemName: icon)
                    .font(.system(size: roomy ? 17 : 13, weight: .semibold))
                    .foregroundStyle(color)
                Text(value)
                    .font(.system(size: roomy ? 17 : 12, weight: .bold, design: .rounded))
                    .foregroundStyle(AscendWidgetV2Tokens.primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.64)
                Text(label.uppercased())
                    .font(.system(size: roomy ? 8 : 7, weight: .semibold, design: .rounded))
                    .tracking(0.65)
                    .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: roomy ? .leading : .center)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("\(label), \(value)")
        .accessibilityHint("Opens Ascend")
    }
}

private struct AscendV2MessageBar: View {
    let message: AscendWidgetMessage
    let roomy: Bool

    var body: some View {
        Link(destination: ascendV2URL(message.path)) {
            HStack(spacing: roomy ? 9 : 6) {
                Image(systemName: message.icon)
                    .font(.system(size: roomy ? 13 : 10, weight: .semibold))
                    .foregroundStyle(message.color)
                Text(message.text)
                    .font(.system(size: roomy ? 12 : 9, weight: .semibold, design: .rounded))
                    .foregroundStyle(AscendWidgetV2Tokens.primaryText.opacity(0.90))
                    .lineLimit(roomy ? 2 : 1)
                    .minimumScaleFactor(0.76)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: roomy ? 10 : 8, weight: .bold))
                    .foregroundStyle(AscendWidgetV2Tokens.primaryText.opacity(0.42))
            }
            .padding(.horizontal, roomy ? 12 : 9)
            .padding(.vertical, roomy ? 10 : 4)
            .background(AscendWidgetV2Tokens.glass, in: RoundedRectangle(cornerRadius: roomy ? 14 : 9, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: roomy ? 14 : 9, style: .continuous).stroke(AscendWidgetV2Tokens.hairline, lineWidth: 0.7))
        }
        .accessibilityLabel(message.text)
        .accessibilityHint("Opens Ascend")
    }
}

private struct AscendV2Header: View {
    let date: Date
    let compact: Bool

    var body: some View {
        HStack {
            AscendV2Brand(compact: compact)
            Spacer()
            Text(date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)).uppercased())
                .font(.system(size: compact ? 9 : 10, weight: .semibold, design: .rounded))
                .tracking(0.7)
                .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                .lineLimit(1)
        }
    }
}

private struct AscendV2MediumWidget: View {
    let state: AscendWidgetV2State

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 4) {
                AscendV2Header(date: state.now, compact: true)
                    .frame(height: 16)

                Link(destination: ascendV2URL("/food-log")) {
                    HStack(spacing: 11) {
                        AscendV2CalorieRing(progress: state.freshness == .previousDay ? nil : state.calorieProgress, diameter: 48)
                        VStack(alignment: .leading, spacing: -2) {
                            Text(state.calorieValue)
                                .font(.system(size: 29, weight: .bold, design: .rounded))
                                .foregroundStyle(AscendWidgetV2Tokens.primaryText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.68)
                            Text(state.calorieLabel)
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .frame(height: 48)
                .accessibilityLabel("Calories, \(state.calorieValue) \(state.calorieLabel)")
                .accessibilityHint("Opens the food log")

                HStack(spacing: 0) {
                    AscendV2Metric(icon: "drop.fill", color: AscendWidgetV2Tokens.blue, value: state.waterValue, label: state.waterLabel, path: "/water-log")
                    Divider().overlay(AscendWidgetV2Tokens.hairline).padding(.vertical, 5)
                    AscendV2Metric(icon: state.movementIcon, color: AscendWidgetV2Tokens.teal, value: state.movementValue, label: state.movementLabel, path: "/burn-log")
                    Divider().overlay(AscendWidgetV2Tokens.hairline).padding(.vertical, 5)
                    AscendV2Metric(icon: "moon.stars.fill", color: AscendWidgetV2Tokens.violet, value: state.recoveryValue, label: state.recoveryLabel, path: ascendV2RecoveryPath)
                }
                .frame(height: 40)
                .background(AscendWidgetV2Tokens.glass, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(AscendWidgetV2Tokens.hairline, lineWidth: 0.7))

                if geometry.size.height >= 155 {
                    AscendV2MessageBar(message: AscendWidgetDecisionEngine.message(for: state), roomy: false)
                        .frame(height: 18)
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
        }
        .privacySensitive()
        .ascendV2Background()
    }
}

private struct AscendV2SmallWidget: View {
    let state: AscendWidgetV2State

    var body: some View {
        Link(destination: ascendV2URL("/food-log")) {
            VStack(alignment: .leading, spacing: 7) {
                AscendV2Brand(compact: true)
                Spacer(minLength: 0)
                HStack(spacing: 9) {
                    AscendV2CalorieRing(progress: state.freshness == .previousDay ? nil : state.calorieProgress, diameter: 52)
                    VStack(alignment: .leading, spacing: -1) {
                        Text(state.calorieValue)
                            .font(.system(size: 25, weight: .bold, design: .rounded))
                            .foregroundStyle(AscendWidgetV2Tokens.primaryText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.62)
                        Text(state.calorieLabel)
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Label("Daily calorie balance", systemImage: "sparkles")
                    .lineLimit(1)
                .font(.system(size: 9, weight: .semibold, design: .rounded))
                .foregroundStyle(AscendWidgetV2Tokens.primaryText.opacity(0.78))
            }
            .padding(13)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Ascend. \(state.calorieValue) \(state.calorieLabel)")
        .accessibilityHint("Opens the food log")
        .privacySensitive()
        .ascendV2Background()
    }
}

private struct AscendV2LargeWidget: View {
    let state: AscendWidgetV2State

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 12) {
                AscendV2Header(date: state.now, compact: false)

                Link(destination: ascendV2URL("/food-log")) {
                    HStack(spacing: 17) {
                        AscendV2CalorieRing(progress: state.freshness == .previousDay ? nil : state.calorieProgress, diameter: 84)
                        VStack(alignment: .leading, spacing: -1) {
                            Text("TODAY")
                                .font(.system(size: 9, weight: .semibold, design: .rounded))
                                .tracking(1.5)
                                .foregroundStyle(AscendWidgetV2Tokens.teal)
                            Text(state.calorieValue)
                                .font(.system(size: 42, weight: .bold, design: .rounded))
                                .foregroundStyle(AscendWidgetV2Tokens.primaryText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.70)
                            Text(state.calorieLabel)
                                .font(.system(size: 16, weight: .medium, design: .rounded))
                                .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Calories, \(state.calorieValue) \(state.calorieLabel)")
                .accessibilityHint("Opens the food log")

                HStack(spacing: 8) {
                    AscendV2Metric(icon: "drop.fill", color: AscendWidgetV2Tokens.blue, value: state.waterValue, label: state.waterLabel, path: "/water-log", roomy: true)
                    AscendV2Metric(icon: state.movementIcon, color: AscendWidgetV2Tokens.teal, value: state.movementValue, label: state.movementLabel, path: "/burn-log", roomy: true)
                    AscendV2Metric(icon: "moon.stars.fill", color: AscendWidgetV2Tokens.violet, value: state.recoveryValue, label: state.recoveryLabel, path: ascendV2RecoveryPath, roomy: true)
                }
                .padding(12)
                .background(AscendWidgetV2Tokens.glass, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AscendWidgetV2Tokens.hairline, lineWidth: 0.7))

                AscendV2MessageBar(message: AscendWidgetDecisionEngine.message(for: state), roomy: true)

                Spacer(minLength: 0)
                Text("Accurate progress from your latest Ascend sync")
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundStyle(AscendWidgetV2Tokens.secondaryText.opacity(0.80))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(18)
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
        }
        .privacySensitive()
        .ascendV2Background()
    }
}

private struct AscendV2AccessoryWidget: View {
    let state: AscendWidgetV2State

    var body: some View {
        HStack(spacing: 8) {
            Image("AscendMark")
                .resizable()
                .scaledToFit()
                .frame(width: 21, height: 21)
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 1) {
                Text("ASCEND").font(.caption2.weight(.bold)).tracking(1.5)
                Text("\(state.calorieValue) \(state.calorieLabel)").font(.headline).lineLimit(1).minimumScaleFactor(0.75)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ascend, \(state.calorieValue) \(state.calorieLabel)")
        .privacySensitive()
        .widgetURL(ascendV2URL("/dashboard"))
    }
}

private struct AscendV2EmptyWidget: View {
    let compact: Bool

    var body: some View {
        Link(destination: ascendV2URL("/dashboard")) {
            VStack(alignment: .leading, spacing: 9) {
                AscendV2Brand(compact: compact)
                Spacer()
                Image(systemName: "arrow.up.forward.app.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(AscendWidgetV2Tokens.teal)
                Text("Open Ascend")
                    .font(.headline)
                    .foregroundStyle(AscendWidgetV2Tokens.primaryText)
                Text("Sign in once to show today’s progress.")
                    .font(.caption2)
                    .foregroundStyle(AscendWidgetV2Tokens.secondaryText)
                    .lineLimit(compact ? 3 : 2)
            }
            .padding(compact ? 13 : 16)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Open Ascend to connect today’s widget")
        .ascendV2Background()
    }
}

private struct AscendV2EmptyAccessoryWidget: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("AscendMark")
                .resizable()
                .scaledToFit()
                .frame(width: 21, height: 21)
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 1) {
                Text("ASCEND").font(.caption2.weight(.bold)).tracking(1.5)
                Text("Open to connect").font(.headline).lineLimit(1).minimumScaleFactor(0.75)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Open Ascend to connect today’s widget")
        .widgetURL(ascendV2URL("/dashboard"))
    }
}

struct AscendWidgetV2View: View {
    @Environment(\.widgetFamily) private var family
    let entry: AscendWidgetEntry

    @ViewBuilder var body: some View {
        if let snapshot = entry.snapshot {
            let state = AscendWidgetV2State(snapshot: snapshot, now: entry.date)
            switch family {
            case .systemMedium: AscendV2MediumWidget(state: state)
            case .systemLarge: AscendV2LargeWidget(state: state)
            case .accessoryRectangular: AscendV2AccessoryWidget(state: state)
            default: AscendV2SmallWidget(state: state)
            }
        } else {
            if family == .accessoryRectangular {
                AscendV2EmptyAccessoryWidget()
            } else {
                AscendV2EmptyWidget(compact: family == .systemSmall)
            }
        }
    }
}

#if DEBUG
private enum AscendWidgetV2PreviewFixtures {
    private static var localDate: String {
        let formatter = DateFormatter()
        formatter.calendar = .autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private static var generatedAt: String { ISO8601DateFormatter().string(from: Date()) }

    static let noData = AscendWidgetSnapshot(
        schemaVersion: 1, localDate: localDate, generatedAt: generatedAt,
        calories: .init(logged: 0, target: 0, remaining: 0),
        water: .init(loggedMl: 0, targetMl: 0, remainingMl: 0),
        movement: .init(steps: 0, stepsAvailable: false, workoutCompleted: false),
        recovery: .init(sleepQuality: nil),
        priority: .init(key: nil, title: "Your daily progress is ready", href: "/dashboard", cta: "Open Ascend")
    )

    static let partial = AscendWidgetSnapshot.placeholder

    static let midday = AscendWidgetSnapshot(
        schemaVersion: 1, localDate: localDate, generatedAt: generatedAt,
        calories: .init(logged: 1280, target: 1900, remaining: 620),
        water: .init(loggedMl: 1200, targetMl: 2500, remainingMl: 1300),
        movement: .init(steps: 4860, stepsAvailable: true, workoutCompleted: false),
        recovery: .init(sleepQuality: nil),
        priority: .init(key: "Movement", title: "A short walk would finish well", href: "/burn-log", cta: "Log Movement")
    )

    static let complete = AscendWidgetSnapshot(
        schemaVersion: 1, localDate: localDate, generatedAt: generatedAt,
        calories: .init(logged: 1810, target: 1900, remaining: 90),
        water: .init(loggedMl: 2600, targetMl: 2500, remainingMl: 0),
        movement: .init(steps: 8240, stepsAvailable: true, workoutCompleted: true),
        recovery: .init(sleepQuality: "good"),
        priority: .init(key: nil, title: "", href: "/progress", cta: "View Progress")
    )

    static let longValues = AscendWidgetSnapshot(
        schemaVersion: 1, localDate: localDate, generatedAt: generatedAt,
        calories: .init(logged: 12345, target: 2000, remaining: 0),
        water: .init(loggedMl: 12000, targetMl: 2500, remainingMl: 0),
        movement: .init(steps: 123456, stepsAvailable: true, workoutCompleted: false),
        recovery: .init(sleepQuality: nil),
        priority: .init(key: "Meal", title: "Make the next meal protein-rich", href: "/food-log", cta: "Log Meal")
    )
}

private struct AscendWidgetV2Previews: PreviewProvider {
    static var previews: some View {
        Group {
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.noData))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · No data")
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.partial))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · Partial goals")
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.midday))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · Midday activity")
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.complete))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · Completed goals")
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.longValues))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · Long values")
            AscendWidgetV2View(entry: .init(date: Date(), snapshot: AscendWidgetV2PreviewFixtures.midday))
                .previewContext(WidgetPreviewContext(family: .systemLarge))
                .previewDisplayName("Large · Recovery unavailable")
        }
    }
}
#endif
