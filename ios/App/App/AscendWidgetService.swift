import Foundation
import WidgetKit

private actor AscendWidgetRefreshCoordinator {
    static let shared = AscendWidgetRefreshCoordinator()

    private var isRefreshing = false
    private var refreshAgain = false
    private var queuedWaiters: [CheckedContinuation<Void, Error>] = []

    func refresh() async throws {
        if isRefreshing {
            refreshAgain = true
            try await withCheckedThrowingContinuation { continuation in
                queuedWaiters.append(continuation)
            }
            return
        }

        isRefreshing = true
        defer { isRefreshing = false }
        var finalError: Error?
        repeat {
            refreshAgain = false
            do {
                try await AscendWidgetService.performRefresh()
                finalError = nil
            } catch {
                finalError = error
            }
        } while refreshAgain
        let result: Result<Void, Error>
        if let finalError {
            result = .failure(finalError)
        } else {
            result = .success(())
        }
        let waiters = queuedWaiters
        queuedWaiters.removeAll()
        for waiter in waiters { waiter.resume(with: result) }
        try result.get()
    }
}

enum AscendWidgetService {
    static func refresh() async throws {
        try await AscendWidgetRefreshCoordinator.shared.refresh()
    }

    fileprivate static func performRefresh() async throws {
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
        guard let currentCredential = AscendSiriCredentialStore.load(),
              currentCredential.firebaseUid == credential.firebaseUid,
              currentCredential.token == credential.token else {
            throw AscendSiriError.notConnected
        }
        try AscendWidgetStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        AscendWidgetStore.clear()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
