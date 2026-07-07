package fit.getascend.app

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesResponseListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

@CapacitorPlugin(name = "PlayBilling")
class PlayBillingPlugin : Plugin(), com.android.billingclient.api.PurchasesUpdatedListener {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var billingClient: BillingClient
    private var pendingPurchaseCall: PluginCall? = null

    override fun load() {
        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases()
            .build()
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
        if (::billingClient.isInitialized) {
            billingClient.endConnection()
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        pluginScope.launch {
            try {
                ensureReady()
                call.resolve(buildStatusPayload(true, billingClient.isReady))
            } catch (_: Exception) {
                call.resolve(buildStatusPayload(false, false))
            }
        }
    }

    @PluginMethod
    fun getProducts(call: PluginCall) {
        val productIds = defaultProductIds()

        pluginScope.launch {
            try {
                ensureReady()
                val details = withContext(Dispatchers.IO) {
                    querySubscriptionProducts(productIds)
                }
                call.resolve(JSObject().apply {
                    put("available", true)
                    put("ready", billingClient.isReady)
                    put("products", productDetailsArray(details))
                })
            } catch (error: Exception) {
                call.reject("Google Play products could not be loaded.", error)
            }
        }
    }

    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId")?.trim()
        if (productId.isNullOrBlank()) {
            call.reject("Google Play productId is required.")
            return
        }

        pluginScope.launch {
            try {
                ensureReady()
                val products = withContext(Dispatchers.IO) {
                    querySubscriptionProducts(listOf(productId))
                }
                val detail = products.firstOrNull()
                    ?: throw IllegalStateException("Google Play product $productId was not found.")
                val offer = detail.subscriptionOfferDetails?.firstOrNull()
                    ?: throw IllegalStateException("Google Play product $productId does not have an active subscription offer.")

                pendingPurchaseCall = call
                bridge.executeOnMainThread {
                    val params = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(
                            listOf(
                                BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(detail)
                                    .setOfferToken(offer.offerToken)
                                    .build()
                            )
                        )
                        .build()
                    val result = billingClient.launchBillingFlow(activity, params)
                    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                        pendingPurchaseCall = null
                        call.reject(result.debugMessage.ifBlank { "Google Play purchase could not be started." })
                    }
                }
            } catch (error: Exception) {
                call.reject("Google Play purchase could not be started.", error)
            }
        }
    }

    @PluginMethod
    fun getActivePurchases(call: PluginCall) {
        pluginScope.launch {
            try {
                ensureReady()
                val purchases = withContext(Dispatchers.IO) {
                    queryActiveSubscriptionPurchases()
                }
                call.resolve(JSObject().apply {
                    put("available", true)
                    put("ready", billingClient.isReady)
                    put("purchases", purchaseArray(purchases))
                })
            } catch (error: Exception) {
                call.reject("Google Play purchases could not be loaded.", error)
            }
        }
    }

    @PluginMethod
    fun acknowledgePurchase(call: PluginCall) {
        val purchaseToken = call.getString("purchaseToken")?.trim()
        if (purchaseToken.isNullOrBlank()) {
            call.reject("Google Play purchaseToken is required.")
            return
        }

        pluginScope.launch {
            try {
                ensureReady()
                val purchases = withContext(Dispatchers.IO) { queryActiveSubscriptionPurchases() }
                val purchase = purchases.firstOrNull { it.purchaseToken == purchaseToken }
                    ?: throw IllegalStateException("Google Play purchase token is no longer available on this device.")

                if (purchase.isAcknowledged) {
                    call.resolve(JSObject().apply { put("acknowledged", true) })
                    return@launch
                }

                val result = withContext(Dispatchers.IO) {
                    suspendCancellableCoroutine<BillingResult> { continuation ->
                        val params = AcknowledgePurchaseParams.newBuilder()
                            .setPurchaseToken(purchaseToken)
                            .build()
                        billingClient.acknowledgePurchase(params) { billingResult ->
                            continuation.resume(billingResult)
                        }
                    }
                }

                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.debugMessage.ifBlank { "Google Play purchase could not be acknowledged." })
                    return@launch
                }

                call.resolve(JSObject().apply { put("acknowledged", true) })
            } catch (error: Exception) {
                call.reject("Google Play purchase could not be acknowledged.", error)
            }
        }
    }

    @PluginMethod
    fun openSubscriptions(call: PluginCall) {
        val packageName = context.packageName
        val intent = android.content.Intent(
            android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("https://play.google.com/store/account/subscriptions?package=$packageName")
        )
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("opened", true) })
        } catch (error: Exception) {
            call.reject("Google Play subscription management could not be opened.", error)
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        val call = pendingPurchaseCall ?: return
        pendingPurchaseCall = null

        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val purchase = purchases?.firstOrNull()
                if (purchase == null) {
                    call.reject("Google Play returned success, but no purchase details were provided.")
                    return
                }
                call.resolve(JSObject().apply {
                    put("purchase", purchaseObject(purchase))
                })
            }

            BillingClient.BillingResponseCode.USER_CANCELED -> {
                call.reject("Google Play purchase was cancelled.")
            }

            else -> {
                call.reject(billingResult.debugMessage.ifBlank { "Google Play purchase failed." })
            }
        }
    }

    private suspend fun ensureReady() {
        if (billingClient.isReady) return

        val result = suspendCancellableCoroutine<BillingResult> { continuation ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(billingResult: BillingResult) {
                    continuation.resume(billingResult)
                }

                override fun onBillingServiceDisconnected() {
                    // Reconnect lazily on the next request.
                }
            })
        }

        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            throw IllegalStateException(result.debugMessage.ifBlank { "Google Play Billing is unavailable." })
        }
    }

    private suspend fun querySubscriptionProducts(productIds: List<String>): List<ProductDetails> {
        if (productIds.isEmpty()) return emptyList()

        return suspendCancellableCoroutine { continuation ->
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    productIds.map { productId ->
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    }
                )
                .build()

            billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
                if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    continuation.resumeWith(Result.failure(IllegalStateException(billingResult.debugMessage.ifBlank {
                        "Google Play products could not be queried."
                    })))
                    return@queryProductDetailsAsync
                }
                continuation.resume(productDetailsList ?: emptyList())
            }
        }
    }

    private suspend fun queryActiveSubscriptionPurchases(): List<Purchase> {
        return suspendCancellableCoroutine { continuation ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                PurchasesResponseListener { billingResult, purchases ->
                    if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                        continuation.resumeWith(Result.failure(IllegalStateException(billingResult.debugMessage.ifBlank {
                            "Google Play purchases could not be queried."
                        })))
                        return@PurchasesResponseListener
                    }
                    continuation.resume(purchases ?: emptyList())
                }
            )
        }
    }

    private fun buildStatusPayload(available: Boolean, ready: Boolean): JSObject {
        return JSObject().apply {
            put("available", available)
            put("ready", ready)
        }
    }

    private fun productDetailsArray(products: List<ProductDetails>): JSArray {
        return JSArray().apply {
            products.forEach { put(productDetailsObject(it)) }
        }
    }

    private fun productDetailsObject(details: ProductDetails): JSObject {
        val offer = details.subscriptionOfferDetails?.firstOrNull()
        val pricingPhase = offer?.pricingPhases?.pricingPhaseList?.firstOrNull()

        return JSObject().apply {
            put("productId", details.productId)
            put("title", details.title)
            put("description", details.description)
            put("offerToken", offer?.offerToken ?: "")
            put("basePlanId", offer?.basePlanId ?: "")
            put("formattedPrice", pricingPhase?.formattedPrice ?: "")
            put("priceCurrencyCode", pricingPhase?.priceCurrencyCode ?: "")
            put("billingPeriod", pricingPhase?.billingPeriod ?: "")
            put("recurrenceMode", pricingPhase?.recurrenceMode ?: 0)
        }
    }

    private fun purchaseArray(purchases: List<Purchase>): JSArray {
        return JSArray().apply {
            purchases.forEach { put(purchaseObject(it)) }
        }
    }

    private fun purchaseObject(purchase: Purchase): JSObject {
        return JSObject().apply {
            put("purchaseToken", purchase.purchaseToken)
            put("orderId", purchase.orderId ?: "")
            put("packageName", context.packageName)
            put("isAcknowledged", purchase.isAcknowledged)
            put("purchaseState", purchase.purchaseState)
            put("products", JSArray().apply { purchase.products.forEach { put(it) } })
            put("productId", purchase.products.firstOrNull() ?: "")
            put("autoRenewing", purchase.isAutoRenewing)
            put("purchaseTime", purchase.purchaseTime)
        }
    }

    private fun defaultProductIds(): List<String> {
        return listOf("ascend_premium_monthly", "ascend_premium_yearly")
    }
}
