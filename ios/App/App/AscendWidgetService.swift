import Foundation
import WidgetKit

enum AscendWidgetService {
    static func refresh() async throws {
        guard let credential = AscendSiriCredentialStore.load(), credential.expiresAt > Date() else {
            AscendWidgetStore.clear()
            WidgetCenter.shared.reloadAllTimelines()
            throw AscendSiriError.notConnected
        }
        var components = URLComponents(url: AscendSiriService.endpoint("siri/widget", base: credential.apiBaseUrl), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "timezoneOffsetMinutes", value: String(-TimeZone.current.secondsFromGMT(for: Date()) / 60))
        ]
        var request = URLRequest(url: components.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AscendSiriError.unavailable }
        if http.statusCode == 401 {
            AscendSiriCredentialStore.clear()
            AscendWidgetStore.clear()
            WidgetCenter.shared.reloadAllTimelines()
            throw AscendSiriError.expiredSession
        }
        guard http.statusCode == 200 else { throw AscendSiriError.server }
        let snapshot = try JSONDecoder().decode(AscendWidgetSnapshot.self, from: data)
        guard snapshot.schemaVersion == 1 else { throw AscendSiriError.server }
        try AscendWidgetStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        AscendWidgetStore.clear()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
