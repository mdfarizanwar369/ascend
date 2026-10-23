import Foundation

struct AscendWidgetMetric: Codable {
    let logged: Int
    let target: Int
    let remaining: Int
}

struct AscendWidgetWaterMetric: Codable {
    let loggedMl: Int
    let targetMl: Int
    let remainingMl: Int
}

struct AscendWidgetMovement: Codable {
    let steps: Int
    let stepsAvailable: Bool?
    let workoutCompleted: Bool

    var hasMeasuredSteps: Bool { stepsAvailable ?? true }
}

struct AscendWidgetRecovery: Codable {
    let sleepQuality: String?
}

struct AscendWidgetPriority: Codable {
    let key: String?
    let title: String
    let href: String
    let cta: String
}

struct AscendWidgetSnapshot: Codable {
    let schemaVersion: Int
    let localDate: String
    let generatedAt: String
    let calories: AscendWidgetMetric
    let water: AscendWidgetWaterMetric
    let movement: AscendWidgetMovement
    let recovery: AscendWidgetRecovery
    let priority: AscendWidgetPriority

    static let placeholder = AscendWidgetSnapshot(
        schemaVersion: 1,
        localDate: "",
        generatedAt: "",
        calories: .init(logged: 1230, target: 1870, remaining: 640),
        water: .init(loggedMl: 1400, targetMl: 2500, remainingMl: 1100),
        movement: .init(steps: 4800, stepsAvailable: true, workoutCompleted: false),
        recovery: .init(sleepQuality: nil),
        priority: .init(key: "Water", title: "Keep sipping through the day", href: "/water-log", cta: "Log Water")
    )
}

enum AscendWidgetStore {
    static let suiteName = "group.fit.getascend.app"
    private static let snapshotKey = "ascend.widget.today.v1"

    static func load() -> AscendWidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: snapshotKey) else { return nil }
        return try? JSONDecoder().decode(AscendWidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: AscendWidgetSnapshot) throws {
        guard let defaults = UserDefaults(suiteName: suiteName) else { throw AscendWidgetStoreError.unavailable }
        defaults.set(try JSONEncoder().encode(snapshot), forKey: snapshotKey)
    }

    static func clear() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: snapshotKey)
    }
}

enum AscendWidgetStoreError: Error {
    case unavailable
}

// Appearance is device-local and independent of the account's daily snapshot.
// Unknown values (including values written by a newer web client) fall back to Classic.
enum AscendWidgetTheme: String, CaseIterable {
    case classic
    case light
    case gymGirl = "gym-girl"
    case cuteLift = "cute-lift"
    case iron
    case summit
    case ascendClub = "ascend-club"
}

enum AscendWidgetThemeStore {
    private static let key = "ascend.widget.appearance.v1"

    static func load() -> AscendWidgetTheme {
        guard let defaults = UserDefaults(suiteName: AscendWidgetStore.suiteName),
              let value = defaults.string(forKey: key) else { return .classic }
        return AscendWidgetTheme(rawValue: value) ?? .classic
    }

    static func save(_ theme: AscendWidgetTheme) throws -> Bool {
        guard let defaults = UserDefaults(suiteName: AscendWidgetStore.suiteName) else {
            throw AscendWidgetStoreError.unavailable
        }
        guard defaults.string(forKey: key) != theme.rawValue else { return false }
        defaults.set(theme.rawValue, forKey: key)
        return true
    }
}
