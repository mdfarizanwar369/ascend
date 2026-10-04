import Capacitor
import Foundation

@objc(AscendHealthPlugin)
public class AscendHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AscendHealthPlugin"
    public let jsName = "AscendHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "collect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "peek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private func fail(_ call: CAPPluginCall, _ error: Error) {
        // Do not expose native error userInfo, Health samples, account IDs or tokens.
        call.reject((error as? AscendHealthError)?.localizedDescription ?? "Apple Health could not refresh. Unlock your device and try again.")
    }
    @objc func status(_ call: CAPPluginCall) {
        Task { do { call.resolve(try await AscendHealthService.shared.status()) } catch { fail(call,error) } }
    }
    @objc func requestAccess(_ call: CAPPluginCall) {
        Task { do { try await AscendHealthService.shared.requestAccess(); call.resolve(["authorizationRequested": true]) } catch { fail(call,error) } }
    }
    @objc func configure(_ call: CAPPluginCall) {
        guard let account = call.getString("accountId"), let installation = call.getString("installationId"),
            let generation = call.getString("connectionGeneration"), let calendarGeneration = call.getString("calendarGeneration"),
            let timezone = call.getString("timezone") else { fail(call,AscendHealthError.invalidConfiguration); return }
        Task {
            do {
                try await AscendHealthService.shared.configure(AscendHealthConfiguration(accountId: account,
                    installationId: installation, connectionGeneration: generation, calendarGeneration: calendarGeneration, timezone: timezone))
                call.resolve()
            } catch { fail(call,error) }
        }
    }
    @objc func collect(_ call: CAPPluginCall) {
        Task { do { call.resolve(try await AscendHealthService.shared.collect()) } catch { fail(call,error) } }
    }
    @objc func peek(_ call: CAPPluginCall) {
        guard let account = call.getString("accountId") else { fail(call,AscendHealthError.accountChanged); return }
        Task { do { call.resolve(try await AscendHealthService.shared.peek(accountId: account)) } catch { fail(call,error) } }
    }
    @objc func acknowledge(_ call: CAPPluginCall) {
        guard let account = call.getString("accountId"), let request = call.getString("requestId") else { fail(call,AscendHealthError.accountChanged); return }
        Task { do { try await AscendHealthService.shared.acknowledge(accountId: account,requestId: request); call.resolve() } catch { fail(call,error) } }
    }
    @objc func disconnect(_ call: CAPPluginCall) {
        Task { do { try await AscendHealthService.shared.disconnect(); call.resolve() } catch { fail(call,error) } }
    }
}
