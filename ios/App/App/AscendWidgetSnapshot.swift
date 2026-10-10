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
    let workoutCompleted: Bool
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
        movement: .init(steps: 0, workoutCompleted: false),
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
