import Capacitor
import Foundation
import WidgetKit

@objc(AscendSiriPlugin)
public class AscendSiriPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AscendSiriPlugin"
    public let jsName = "AscendSiri"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWidgetTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWidgetTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else { call.resolve(["supported": false, "connected": false]); return }
        guard let credential = AscendSiriCredentialStore.load(), credential.expiresAt > Date() else {
            call.resolve(["supported": true, "connected": false]); return
        }
        call.resolve([
            "supported": true,
            "connected": true,
            "firebaseUid": credential.firebaseUid,
            "expiresAt": ISO8601DateFormatter().string(from: credential.expiresAt)
        ])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else { call.reject("Siri shortcuts need iOS 16 or newer."); return }
        guard let apiBaseUrl = call.getString("apiBaseUrl"),
              let firebaseToken = call.getString("firebaseToken"),
              let firebaseUid = call.getString("firebaseUid") else {
            call.reject("Sign in to Ascend before connecting Siri.")
            return
        }
        Task {
            do {
                let expiry = try await AscendSiriService.connect(apiBaseUrl: apiBaseUrl, firebaseToken: firebaseToken, firebaseUid: firebaseUid)
                try? await AscendWidgetService.refresh()
                call.resolve(["connected": true, "expiresAt": ISO8601DateFormatter().string(from: expiry)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func refreshWidget(_ call: CAPPluginCall) {
        Task {
            do {
                try await AscendWidgetService.refresh()
                call.resolve(["refreshed": true])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func getWidgetTheme(_ call: CAPPluginCall) {
        call.resolve([
            "theme": AscendWidgetThemeStore.load().rawValue,
            "availableThemes": AscendWidgetTheme.allCases.map(\.rawValue)
        ])
    }

    @objc func setWidgetTheme(_ call: CAPPluginCall) {
        guard let value = call.getString("theme"),
              let theme = AscendWidgetTheme(rawValue: value) else {
            call.reject("Choose an available Ascend theme.")
            return
        }
        do {
            if try AscendWidgetThemeStore.save(theme) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            call.resolve(["theme": theme.rawValue])
        } catch {
            call.reject("Ascend could not save the widget theme.")
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        Task {
            await AscendSiriService.disconnect()
            AscendWidgetService.clear()
            call.resolve()
        }
    }
}
