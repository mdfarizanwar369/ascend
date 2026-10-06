import Capacitor
import Foundation
import HealthKit

@objc(AscendHealthPlugin)
public class AscendHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AscendHealthPlugin"
    public let jsName = "AscendHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let requestedKey = "ascend.appleHealth.readAccessRequested"
    private let dataTypes = ["STEPS", "ACTIVE_CALORIES", "EXERCISE"]

    private var available: Bool { HKHealthStore.isHealthDataAvailable() }
    private var requested: Bool { UserDefaults.standard.bool(forKey: requestedKey) }

    private func status() -> [String: Any] {
        // HealthKit intentionally does not reveal whether read access was denied.
        // This tracks that the permission sheet was completed, not that data was granted.
        [
            "available": available,
            "availability": available ? "available" : "unavailable",
            "permissionsGranted": requested ? dataTypes : [],
            "allPermissionsGranted": requested,
            "authorizationRequested": requested
        ]
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(status())
    }

    @objc func requestHealthPermissions(_ call: CAPPluginCall) {
        guard available else { call.reject("Apple Health is unavailable on this device."); return }
        let read: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.workoutType()
        ]
        store.requestAuthorization(toShare: [], read: read) { [weak self] completed, error in
            guard let self = self else { call.reject("Apple Health is unavailable."); return }
            if let error = error { call.reject(error.localizedDescription); return }
            guard completed else { call.reject("Apple Health access was not completed."); return }
            UserDefaults.standard.set(true, forKey: self.requestedKey)
            call.resolve(self.status())
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard available else { call.reject("Apple Health is unavailable on this device."); return }
        guard requested else { call.reject("Connect Apple Health before syncing."); return }
        Task {
            do {
                let calendar = Calendar.current
                let today = calendar.startOfDay(for: Date())
                guard let start = calendar.date(byAdding: .day, value: -6, to: today),
                      let end = calendar.date(byAdding: .day, value: 1, to: today) else {
                    call.reject("Could not determine the Health sync dates.")
                    return
                }
                var records = try await dailyRecords(.stepCount, unit: .count(), recordType: "steps_daily", start: start, end: end)
                records += try await dailyRecords(.activeEnergyBurned, unit: .kilocalorie(), recordType: "active_calories_daily", start: start, end: end)
                records += try await workoutRecords(start: start, end: end)
                var result = status()
                result["timezone"] = TimeZone.current.identifier
                result["syncedAt"] = ISO8601DateFormatter().string(from: Date())
                result["records"] = records
                call.resolve(result)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func dailyRecords(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, recordType: String,
                              start: Date, end: Date) async throws -> [[String: Any]] {
        let type = HKObjectType.quantityType(forIdentifier: identifier)!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let collection: HKStatisticsCollection = try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
                                                    options: .cumulativeSum, anchorDate: start,
                                                    intervalComponents: DateComponents(day: 1))
            query.initialResultsHandler = { _, collection, error in
                if let error = error { continuation.resume(throwing: error) }
                else if let collection = collection { continuation.resume(returning: collection) }
                else { continuation.resume(throwing: NSError(domain: "AscendHealth", code: 1)) }
            }
            store.execute(query)
        }
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        var records: [[String: Any]] = []
        collection.enumerateStatistics(from: start, to: end.addingTimeInterval(-1)) { statistics, _ in
            let day = formatter.string(from: statistics.startDate)
            records.append([
                "type": recordType,
                "externalRecordId": "apple-health-\(recordType)-\(day)",
                "recordedOn": day,
                "valueNumeric": statistics.sumQuantity()?.doubleValue(for: unit) ?? 0,
                "unit": recordType == "steps_daily" ? "steps" : "kcal",
                "sourceApp": "Apple Health"
            ])
        }
        return records
    }

    private func workoutRecords(start: Date, end: Date) async throws -> [[String: Any]] {
        let samples: [HKSample] = try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
            let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate,
                                      limit: 100, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, error in
                if let error = error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: samples ?? []) }
            }
            store.execute(query)
        }
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        let iso = ISO8601DateFormatter()
        return samples.compactMap { sample -> [String: Any]? in
            guard let workout = sample as? HKWorkout else { return nil }
            return [
                "type": "exercise_session",
                "externalRecordId": workout.uuid.uuidString,
                "recordedOn": formatter.string(from: workout.endDate),
                "startAt": iso.string(from: workout.startDate),
                "endAt": iso.string(from: workout.endDate),
                "valueNumeric": workout.duration / 60,
                "unit": "minutes",
                "sourceApp": workout.sourceRevision.source.name,
                "metadata": ["activityType": workout.workoutActivityType.rawValue]
            ]
        }
    }
}
