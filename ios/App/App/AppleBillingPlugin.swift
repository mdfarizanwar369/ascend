import Capacitor
import StoreKit

@objc(AppleBillingPlugin)
public class AppleBillingPlugin: CAPPlugin, CAPBridgedPlugin, SKPaymentQueueDelegate {
    public let identifier = "AppleBillingPlugin"
    public let jsName = "AppleBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPurchaseIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPurchaseIntent", returnType: CAPPluginReturnPromise)
    ]
    private let productIDs: Set<String> = ["fit.getascend.app.premium.monthly", "fit.getascend.app.trainerpro.monthly"]
    private var updatesTask: Task<Void, Never>?
    private var intentsTask: Task<Void, Never>?
    private var pendingProduct: Product?

    public override func load() {
        if #available(iOS 16.4, *) {
            intentsTask = Task { @MainActor [weak self] in
                for await intent in PurchaseIntent.intents {
                    guard let self else { return }
                    self.receiveIntent(intent.product)
                }
            }
        } else {
            // StoreKit's supported fallback for promoted purchases on iOS 15–16.3.
            SKPaymentQueue.default().delegate = self
        }
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result, self.productIDs.contains(transaction.productID) {
                    self.notifyListeners("transactionsUpdated", data: [:])
                }
            }
        }
    }
    deinit { updatesTask?.cancel(); intentsTask?.cancel() }

    @MainActor private func receiveIntent(_ product: Product) {
        guard productIDs.contains(product.id) else { return }
        pendingProduct = product
        notifyListeners("purchaseIntent", data: ["productId": product.id], retainUntilConsumed: true)
    }

    public func paymentQueue(_ queue: SKPaymentQueue, shouldAddStorePayment payment: SKPayment, for product: SKProduct) -> Bool {
        guard productIDs.contains(product.productIdentifier) else { return false }
        Task { @MainActor in
            if let selected = try? await Product.products(for: [product.productIdentifier]).first { receiveIntent(selected) }
        }
        // Defer until the customer signs in and explicitly confirms through the StoreKit 2 flow.
        return false
    }

    @objc func getPurchaseIntent(_ call: CAPPluginCall) {
        Task { @MainActor in
            if let product = pendingProduct { call.resolve(["productId": product.id]) }
            else { call.resolve([:]) }
        }
    }

    @objc func clearPurchaseIntent(_ call: CAPPluginCall) {
        Task { @MainActor in pendingProduct = nil; call.resolve() }
    }

    private func payload(_ result: VerificationResult<Transaction>) -> JSObject? {
        guard case .verified(let transaction) = result, productIDs.contains(transaction.productID) else { return nil }
        // The backend selects Production/Sandbox from Apple's verified JWS. This also supports iOS 15.
        return ["transactionId": String(transaction.id), "signedTransaction": result.jwsRepresentation]
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
                let product: Product
                if let pending = self.pendingProduct, pending.id == id { product = pending }
                else {
                    guard let found = try await Product.products(for: [id]).first else {
                        call.reject("This subscription is not available from Apple yet."); return
                    }
                    product = found
                }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                self.pendingProduct = nil
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
