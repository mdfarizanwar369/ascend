import Foundation
import HealthKit

actor AscendHealthService {
    static let shared = AscendHealthService()
    private let health = HKHealthStore()
    private let storage = AscendHealthSyncStore.shared
    private var observers: [HKObserverQuery] = []
    private var collecting = false

    private let steps = HKQuantityType.quantityType(forIdentifier: .stepCount)!
    private let activeEnergy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
    private var readTypes: Set<HKObjectType> { [steps, activeEnergy, HKObjectType.workoutType()] }
    private func iso(_ value: Date) -> String { ISO8601DateFormatter().string(from: value) }

    func status() throws -> [String: Any] {
        let state = try storage.load()
        return ["available": HKHealthStore.isHealthDataAvailable(), "capability": "appleHealthReadV1",
            "installationId": storage.installationId, "connected": state.configuration != nil,
            "accountId": state.configuration?.accountId as Any? ?? NSNull(),
            "connectionGeneration": state.configuration?.connectionGeneration as Any? ?? NSNull(),
            "paused": state.paused == true,
            "pendingCount": state.pending.count, "lastReadAt": state.lastReadAt as Any? ?? NSNull()]
    }

    func requestAccess() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw AscendHealthError.unavailable }
        // Success means the sheet completed, not that the member granted every read.
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            health.requestAuthorization(toShare: [], read: readTypes) { success, error in
                if let error { continuation.resume(throwing: error) }
                else if success { continuation.resume() }
                else { continuation.resume(throwing: AscendHealthError.unavailable) }
            }
        }
    }

    func configure(_ config: AscendHealthConfiguration) throws {
        guard UUID(uuidString: config.accountId) != nil, UUID(uuidString: config.connectionGeneration) != nil,
            UUID(uuidString: config.calendarGeneration) != nil, TimeZone(identifier: config.timezone) != nil,
            config.installationId == storage.installationId else { throw AscendHealthError.invalidConfiguration }
        var state = try storage.load()
        if state.configuration?.accountId != config.accountId || state.configuration?.connectionGeneration != config.connectionGeneration
            || state.configuration?.calendarGeneration != config.calendarGeneration {
            state = AscendHealthStoreState()
        }
        state.configuration = config
        state.paused = false
        try storage.save(state)
        installObservers()
    }

    func restore() {
        guard HKHealthStore.isHealthDataAvailable(), let state = try? storage.load(), state.configuration != nil, state.paused != true else { return }
        installObservers()
    }

    private func installObservers() {
        guard observers.isEmpty else { return }
        for type in readTypes {
            let query = HKObserverQuery(sampleType: type as! HKSampleType, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }
                Task {
                    // Durable native queue works without the hosted WebView or a server credential.
                    _ = try? await self.collect()
                    completion()
                }
            }
            observers.append(query)
            health.execute(query)
            health.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    func disconnect() async throws {
        stopObservers()
        try storage.clear()
    }

    func pause() throws {
        var state = try storage.load()
        state.paused = true
        try storage.save(state)
        stopObservers()
    }

    private func stopObservers() {
        for observer in observers { health.stop(observer) }
        observers.removeAll()
        for type in readTypes {
            health.disableBackgroundDelivery(for: type) { _, _ in }
        }
    }

    func peek(accountId: String) throws -> [String: Any] {
        let state = try storage.load()
        guard state.configuration?.accountId == accountId else { throw AscendHealthError.accountChanged }
        guard let packet = state.pending.first else { return ["packet": NSNull(), "pendingCount": 0] }
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(packet)) as! [String: Any]
        object["snapshots"] = packet.snapshots.map { value -> [String: Any] in
            ["day": value.day, "timezone": value.timezone, "windowStart": value.windowStart, "windowEnd": value.windowEnd,
                "observedAt": value.observedAt, "steps": value.steps as Any? ?? NSNull(), "stepsState": value.stepsState,
                "activeCalories": value.activeCalories as Any? ?? NSNull(), "energyState": value.energyState]
        }
        object["workouts"] = packet.workouts.map { value -> [String: Any] in
            ["externalId": value.externalId, "startAt": value.startAt, "endAt": value.endAt,
                "activityType": value.activityType, "activeCalories": value.activeCalories as Any? ?? NSNull(),
                "sourceName": value.sourceName as Any? ?? NSNull()]
        }
        return ["packet": object, "pendingCount": state.pending.count]
    }

    func acknowledge(accountId: String, requestId: String) throws {
        var state = try storage.load()
        guard state.configuration?.accountId == accountId else { throw AscendHealthError.accountChanged }
        guard state.pending.first?.requestId == requestId else { throw AscendHealthError.accountChanged }
        state.pending.removeFirst()
        if state.pending.isEmpty { state.acknowledgedWorkoutAnchor = state.workoutAnchor }
        try storage.save(state)
    }

    func collect() async throws -> [String: Any] {
        guard HKHealthStore.isHealthDataAvailable() else { throw AscendHealthError.unavailable }
        guard !collecting else { throw AscendHealthError.busy }
        collecting = true
        defer { collecting = false }
        var state = try storage.load()
        guard let config = state.configuration else { throw AscendHealthError.disconnected }
        guard state.paused != true else { return try peek(accountId: config.accountId) }
        if !state.pending.isEmpty { return try peek(accountId: config.accountId) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: config.timezone)!
        let today = calendar.startOfDay(for: Date())
        let firstDay = calendar.date(byAdding: .day, value: -29, to: today)!
        let anchoredStart = state.historyStartAt.flatMap { ISO8601DateFormatter().date(from: $0) } ?? firstDay
        state.historyStartAt = iso(anchoredStart)
        let rangeEnd = calendar.date(byAdding: .day, value: 1, to: today)!
        let observedAt = iso(Date())
        async let stepValues = dailyValues(type: steps, unit: .count(), start: firstDay, end: rangeEnd, calendar: calendar)
        async let energyValues = dailyValues(type: activeEnergy, unit: .kilocalorie(), start: firstDay, end: rangeEnd, calendar: calendar)
        let values = try await (stepValues, energyValues)
        var snapshots: [AscendHealthSnapshot] = []
        let dayFormat = DateFormatter()
        dayFormat.calendar = calendar
        dayFormat.locale = Locale(identifier: "en_US_POSIX")
        dayFormat.timeZone = calendar.timeZone
        dayFormat.dateFormat = "yyyy-MM-dd"
        for offset in 0..<30 {
            let start = calendar.date(byAdding: .day, value: offset, to: firstDay)!
            let end = calendar.date(byAdding: .day, value: 1, to: start)!
            let key = dayFormat.string(from: start)
            let step = values.0[key].map { $0.rounded() }
            let energy = values.1[key]
            snapshots.append(AscendHealthSnapshot(day: key, timezone: config.timezone, windowStart: iso(start),
                windowEnd: iso(end), observedAt: observedAt, steps: step, stepsState: step == nil ? "unavailable" : "observed",
                activeCalories: energy, energyState: energy == nil ? "unavailable" : "observed"))
        }
        var anchor: HKQueryAnchor?
        if let data = state.workoutAnchor {
            anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
        }
        var workouts: [AscendHealthWorkout] = []
        var deletedIds: [String] = []
        // Bound each query and each collection. A remaining page is picked up on the next sync.
        for _ in 0..<10 {
            let page = try await workoutPage(anchor: anchor, start: anchoredStart)
            for workout in page.workouts {
                var calories: Double?
                if #available(iOS 16.0, *) {
                    calories = workout.statistics(for: activeEnergy)?.sumQuantity()?.doubleValue(for: .kilocalorie())
                }
                if let amount = calories, !amount.isFinite || amount < 0 { calories = nil }
                workouts.append(AscendHealthWorkout(externalId: workout.uuid.uuidString.lowercased(),
                    startAt: iso(workout.startDate), endAt: iso(workout.endDate),
                    activityType: activityName(workout.workoutActivityType), activeCalories: calories,
                    sourceName: String(workout.sourceRevision.source.name.prefix(200))))
            }
            deletedIds.append(contentsOf: page.deleted.map { $0.uuid.uuidString.lowercased() })
            anchor = page.anchor
            if page.workouts.count + page.deleted.count < 200 { break }
        }
        // Recheck after asynchronous queries: disconnect or an account change must cancel the read.
        let current = try storage.load()
        guard current.configuration?.accountId == config.accountId,
            current.configuration?.connectionGeneration == config.connectionGeneration,
            current.configuration?.calendarGeneration == config.calendarGeneration,
            current.paused != true else { throw AscendHealthError.accountChanged }
        var remainingSnapshots = snapshots
        var remainingWorkouts = workouts
        var remainingDeletes = deletedIds
        while !remainingSnapshots.isEmpty || !remainingWorkouts.isEmpty || !remainingDeletes.isEmpty {
            let dailyChunk = Array(remainingSnapshots.prefix(30))
            remainingSnapshots.removeFirst(dailyChunk.count)
            let workoutChunk = Array(remainingWorkouts.prefix(200-dailyChunk.count))
            remainingWorkouts.removeFirst(workoutChunk.count)
            let deleteChunk = Array(remainingDeletes.prefix(200-dailyChunk.count-workoutChunk.count))
            remainingDeletes.removeFirst(deleteChunk.count)
            state.sequence += 1
            state.pending.append(AscendHealthPacket(schemaVersion: 2, requestId: UUID().uuidString.lowercased(),
                installationId: config.installationId, connectionGeneration: config.connectionGeneration,
                calendarGeneration: config.calendarGeneration, sequence: state.sequence,
                snapshots: dailyChunk, workouts: workoutChunk, deletedWorkoutIds: deleteChunk))
        }
        if let anchor { state.workoutAnchor = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) }
        state.lastReadAt = observedAt
        try storage.save(state)
        return try peek(accountId: config.accountId)
    }

    private func dailyValues(type: HKQuantityType, unit: HKUnit, start: Date, end: Date, calendar: Calendar) async throws -> [String: Double] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
            var interval = DateComponents(day: 1)
            interval.calendar = calendar
            interval.timeZone = calendar.timeZone
            let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
                options: .cumulativeSum, anchorDate: start, intervalComponents: interval)
            query.initialResultsHandler = { _, collection, error in
                if let error {
                    if (error as NSError).domain == HKErrorDomain && (error as NSError).code == HKError.Code.errorAuthorizationDenied.rawValue {
                        continuation.resume(returning: [:])
                    } else { continuation.resume(throwing: error) }
                    return
                }
                var result: [String: Double] = [:]
                let format = DateFormatter()
                format.calendar = calendar
                format.timeZone = calendar.timeZone
                format.locale = Locale(identifier: "en_US_POSIX")
                format.dateFormat = "yyyy-MM-dd"
                collection?.enumerateStatistics(from: start, to: end.addingTimeInterval(-0.001)) { stats, _ in
                    if let value = stats.sumQuantity()?.doubleValue(for: unit), value.isFinite, value >= 0 {
                        result[format.string(from: stats.startDate)] = value
                    }
                }
                continuation.resume(returning: result)
            }
            health.execute(query)
        }
    }

    private func workoutPage(anchor: HKQueryAnchor?, start: Date) async throws -> (workouts: [HKWorkout], deleted: [HKDeletedObject], anchor: HKQueryAnchor?) {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [.strictStartDate])
            let query = HKAnchoredObjectQuery(type: .workoutType(), predicate: predicate, anchor: anchor, limit: 200) { _, samples, deleted, nextAnchor, error in
                if let error {
                    if (error as NSError).domain == HKErrorDomain && (error as NSError).code == HKError.Code.errorAuthorizationDenied.rawValue {
                        continuation.resume(returning: ([], [], anchor))
                    } else { continuation.resume(throwing: error) }
                    return
                }
                continuation.resume(returning: (samples as? [HKWorkout] ?? [], deleted ?? [], nextAnchor))
            }
            health.execute(query)
        }
    }

    private func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .walking: return "Walking"
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .highIntensityIntervalTraining: return "HIIT"
        case .hiking: return "Hiking"
        default: return "Workout"
        }
    }
}
