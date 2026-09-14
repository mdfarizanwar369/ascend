import Capacitor
import StoreKit

@objc(AppleBillingPlugin)
public class AppleBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleBillingPlugin"
    public let jsName = "AppleBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]
    private let productIDs: Set<String> = ["fit.getascend.app.premium.monthly", "fit.getascend.app.trainerpro.monthly"]
    private var updatesTask: Task<Void, Never>?

    public override func load() {
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result, self.productIDs.contains(transaction.productID) {
                    self.notifyListeners("transactionsUpdated", data: [:])
                }
            }
        }
    }
    deinit { updatesTask?.cancel() }

    private func payload(_ result: VerificationResult<Transaction>) -> JSObject? {
        guard case .verified(let transaction) = result, productIDs.contains(transaction.productID) else { return nil }
        return ["transactionId": String(transaction.id), "signedTransaction": result.jwsRepresentation,
                "environment": transaction.environment == .production ? "Production" : "Sandbox"]
    }

    private func transactions() async -> [JSObject] {
        var results: [String: JSObject] = [:]
        // Include unfinished transactions so a network failure after payment can recover on next launch.
        for await result in Transaction.unfinished {
            if let item = payload(result), let id = item["transactionId"] as? String { results[id] = item }
        }
        for await result in Transaction.currentEntitlements {
            if let item = payload(result), let id = item["transactionId"] as? String { results[id] = item }
        }
        return Array(results.values)
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: productIDs)
                let items: [JSObject] = products.filter { $0.type == .autoRenewable }.map {
                    ["id": $0.id, "title": $0.displayName, "description": $0.description, "displayPrice": $0.displayPrice]
                }
                call.resolve(["products": items])
            } catch { call.reject("Could not load Apple subscription prices. Please try again.") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId"), productIDs.contains(id),
              let tokenText = call.getString("appAccountToken"), let token = UUID(uuidString: tokenText) else {
            call.reject("Sign in to Ascend before subscribing."); return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("This subscription is not available from Apple yet."); return
                }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verification):
                    guard let transaction = self.payload(verification) else { call.reject("Apple could not verify this purchase."); return }
                    // Finish only after the server has verified and saved the entitlement.
                    call.resolve(["outcome": "purchased", "transaction": transaction])
                case .userCancelled: call.resolve(["outcome": "cancelled"])
                case .pending: call.resolve(["outcome": "pending"])
                @unknown default: call.reject("Apple returned an unexpected purchase result.")
                }
            } catch { call.reject("The Apple purchase could not be completed. Please try again.") }
        }
    }

    @objc func getTransactions(_ call: CAPPluginCall) {
        Task { call.resolve(["transactions": await transactions()]) }
    }
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(["transactions": await transactions()])
            } catch { call.reject("Restore was not completed. Please try again.") }
        }
    }
    @objc func finish(_ call: CAPPluginCall) {
        guard let idText = call.getString("transactionId"), let id = UInt64(idText) else { call.reject("Missing transaction."); return }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == id, productIDs.contains(transaction.productID) {
                    await transaction.finish()
                }
            }
            call.resolve()
        }
    }
    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else { call.reject("Please reopen Ascend and try again."); return }
            do { try await AppStore.showManageSubscriptions(in: scene); call.resolve() }
            catch { call.reject("Could not open your Apple subscriptions.") }
        }
    }
}
