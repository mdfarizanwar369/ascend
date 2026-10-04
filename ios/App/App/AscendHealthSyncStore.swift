import Foundation

struct AscendHealthConfiguration: Codable {
    let accountId: String
    let installationId: String
    let connectionGeneration: String
    let calendarGeneration: String
    let timezone: String
}

struct AscendHealthSnapshot: Codable {
    let day: String
    let timezone: String
    let windowStart: String
    let windowEnd: String
    let observedAt: String
    let steps: Double?
    let stepsState: String
    let activeCalories: Double?
    let energyState: String
}

struct AscendHealthWorkout: Codable {
    let externalId: String
    let startAt: String
    let endAt: String
    let activityType: String
    let activeCalories: Double?
    let sourceName: String?
}

struct AscendHealthPacket: Codable {
    let schemaVersion: Int
    let requestId: String
    let installationId: String
    let connectionGeneration: String
    let calendarGeneration: String
    let sequence: Int
    let snapshots: [AscendHealthSnapshot]
    let workouts: [AscendHealthWorkout]
    let deletedWorkoutIds: [String]
    let workoutRebuild: AscendHealthWorkoutRebuild?
}

struct AscendHealthWorkoutRebuild: Codable {
    let id: String
    let since: String
    let complete: Bool
}

struct AscendHealthStoreState: Codable {
    var configuration: AscendHealthConfiguration?
    var sequence = 0
    var workoutAnchor: Data?
    var acknowledgedWorkoutAnchor: Data?
    var pending: [AscendHealthPacket] = []
    var lastReadAt: String?
    var historyStartAt: String?
    var workoutRebuildId: String?
    var workoutRebuildSince: String?
    var paused: Bool? = false
}

// No Firebase token, Apple identifier, raw sensor series or analytics data is stored here.
final class AscendHealthSyncStore {
    static let shared = AscendHealthSyncStore()
    private let directory: URL
    private let file: URL
    let installationId: String

    private init() {
        let existing = UserDefaults.standard.string(forKey: "ascend.health.installation")
        installationId = existing ?? UUID().uuidString.lowercased()
        if existing == nil { UserDefaults.standard.set(installationId, forKey: "ascend.health.installation") }
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AscendHealth", isDirectory: true)
        file = directory.appendingPathComponent("sync.json")
    }

    func load() throws -> AscendHealthStoreState {
        guard FileManager.default.fileExists(atPath: file.path) else { return AscendHealthStoreState() }
        return try JSONDecoder().decode(AscendHealthStoreState.self, from: Data(contentsOf: file))
    }

    func save(_ state: AscendHealthStoreState) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete])
        var excluded = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        let data = try JSONEncoder().encode(state)
        guard data.count <= 4 * 1024 * 1024 else { throw AscendHealthError.queueFull }
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        var protectedFile = file
        try protectedFile.setResourceValues(values)
    }

    func clear() throws {
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
}

enum AscendHealthError: LocalizedError {
    case unavailable, disconnected, queueFull, accountChanged, busy, invalidConfiguration
    var errorDescription: String? {
        switch self {
        case .unavailable: return "Apple Health is not available on this device."
        case .disconnected: return "Connect Apple Health to this Ascend account first."
        case .queueFull: return "Health updates are pending. Open Ascend and sync before collecting more."
        case .accountChanged: return "Your account or Health connection changed. Reconnect before syncing."
        case .busy: return "A Health sync is already running. Please try again shortly."
        case .invalidConfiguration: return "The Health connection configuration is invalid."
        }
    }
}
