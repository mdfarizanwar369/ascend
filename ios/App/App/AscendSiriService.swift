import Foundation
import Security

struct AscendSiriCredential: Codable {
    let token: String
    let firebaseUid: String
    let apiBaseUrl: URL
    let expiresAt: Date
}

enum AscendSiriCredentialStore {
    private static let service = "fit.getascend.app.siri"
    private static let account = "today-owner"

    private static var lookup: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func load() -> AscendSiriCredential? {
        var request = lookup
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(AscendSiriCredential.self, from: data)
    }

    static func save(_ credential: AscendSiriCredential) throws {
        let data = try JSONEncoder().encode(credential)
        SecItemDelete(lookup as CFDictionary)
        var request = lookup
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else {
            throw AscendSiriError.storage
        }
    }

    static func clear() {
        SecItemDelete(lookup as CFDictionary)
    }
}

enum AscendSiriError: LocalizedError {
    case invalidConfiguration, storage, notConnected, unavailable, expiredSession, server

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: return "Ascend could not configure Siri. Please update the app."
        case .storage: return "Ascend could not save Siri access on this iPhone."
        case .notConnected, .expiredSession: return "Open Ascend and make sure you are signed in."
        case .unavailable: return "Ascend could not reach today's numbers. Please try again."
        case .server: return "Ascend could not answer right now. Please try again."
        }
    }
}

enum AscendSiriService {
    static func validatedApiUrl(_ raw: String) throws -> URL {
        guard let url = URL(string: raw),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.host != nil,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path == "/api/v1" || components.path == "/api/v1/" else {
            throw AscendSiriError.invalidConfiguration
        }
        return url
    }

    static func endpoint(_ path: String, base: URL) -> URL {
        base.appendingPathComponent(path)
    }

    static func connect(apiBaseUrl: String, firebaseToken: String, firebaseUid: String) async throws -> Date {
        let base = try validatedApiUrl(apiBaseUrl)
        guard !firebaseToken.isEmpty, !firebaseUid.isEmpty else { throw AscendSiriError.notConnected }
        if let existing = AscendSiriCredentialStore.load(), existing.firebaseUid != firebaseUid {
            AscendSiriCredentialStore.clear()
        }
        if let existing = AscendSiriCredentialStore.load(),
           existing.firebaseUid == firebaseUid,
           existing.apiBaseUrl == base,
           existing.expiresAt > Date().addingTimeInterval(7 * 24 * 60 * 60) {
            return existing.expiresAt
        }

        var request = URLRequest(url: endpoint("me/siri/connect", base: base), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.httpMethod = "POST"
        request.setValue("Bearer \(firebaseToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw AscendSiriError.server }
        struct Connection: Decodable { let token: String; let expiresAt: String }
        let connection = try JSONDecoder().decode(Connection.self, from: data)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard connection.token.hasPrefix("ascs_"),
              let expiresAt = formatter.date(from: connection.expiresAt), expiresAt > Date() else {
            throw AscendSiriError.server
        }
        try AscendSiriCredentialStore.save(.init(token: connection.token, firebaseUid: firebaseUid, apiBaseUrl: base, expiresAt: expiresAt))
        return expiresAt
    }

    static func disconnect() async {
        guard let credential = AscendSiriCredentialStore.load() else { return }
        AscendSiriCredentialStore.clear()
        var request = URLRequest(url: endpoint("siri/disconnect", base: credential.apiBaseUrl), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 4)
        request.httpMethod = "POST"
        request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: request)
    }

    static func answer(_ metric: String) async -> String {
        guard let credential = AscendSiriCredentialStore.load() else { return AscendSiriError.notConnected.localizedDescription }
        guard credential.expiresAt > Date() else {
            AscendSiriCredentialStore.clear()
            return AscendSiriError.expiredSession.localizedDescription
        }
        var components = URLComponents(url: endpoint("siri/today", base: credential.apiBaseUrl), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "intent", value: metric),
            URLQueryItem(name: "timezoneOffsetMinutes", value: String(-TimeZone.current.secondsFromGMT(for: Date()) / 60))
        ]
        var request = URLRequest(url: components.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return AscendSiriError.unavailable.localizedDescription }
            if http.statusCode == 401 {
                AscendSiriCredentialStore.clear()
                return AscendSiriError.expiredSession.localizedDescription
            }
            guard http.statusCode == 200 else { return AscendSiriError.server.localizedDescription }
            struct Answer: Decodable { let spokenText: String }
            let answer = try JSONDecoder().decode(Answer.self, from: data)
            return answer.spokenText
        } catch {
            return AscendSiriError.unavailable.localizedDescription
        }
    }

    static func ask(_ question: String) async -> String {
        guard let credential = AscendSiriCredentialStore.load() else { return AscendSiriError.notConnected.localizedDescription }
        guard credential.expiresAt > Date() else {
            AscendSiriCredentialStore.clear()
            return AscendSiriError.expiredSession.localizedDescription
        }
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 250 else {
            return "Please ask a shorter question about your Ascend information."
        }
        var request = URLRequest(url: endpoint("siri/ask", base: credential.apiBaseUrl), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.httpMethod = "POST"
        request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "question": trimmed,
            "timezoneOffsetMinutes": -TimeZone.current.secondsFromGMT(for: Date()) / 60
        ])
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return AscendSiriError.unavailable.localizedDescription }
            if http.statusCode == 401 {
                AscendSiriCredentialStore.clear()
                return AscendSiriError.expiredSession.localizedDescription
            }
            guard http.statusCode == 200 else { return AscendSiriError.server.localizedDescription }
            struct Answer: Decodable { let spokenText: String }
            return try JSONDecoder().decode(Answer.self, from: data).spokenText
        } catch {
            return AscendSiriError.unavailable.localizedDescription
        }
    }
}
