package app.fihaven.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Google Play Billing wrapper for the Pro subscription. The FiHaven
 * server is authoritative: on a verified purchase we hand the
 * `purchaseToken` to `onPurchase`, which posts it to
 * `/api/billing/google/verify`. See docs/native-contract.md §billing.
 *
 * Won't return products in an emulator without Play services / a Play
 * Console listing — callers degrade to the promo path in that case.
 */
class BillingManager(
    context: Context,
    private val onPurchase: (productId: String, purchaseToken: String) -> Unit,
) {
    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    /// Product id of the subscription the user already owns, if any. Play rejects
    /// buying a second subscription in the same group (ITEM_ALREADY_OWNED) unless
    /// the flow is marked as a replacement — this is what makes "upgrade solo Pro
    /// → Family" possible.
    private val _activeProductId = MutableStateFlow<String?>(null)
    val activeProductId: StateFlow<String?> = _activeProductId.asStateFlow()

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handlePurchase(it) }
        }
    }

    private val client = BillingClient.newBuilder(context)
        .setListener(purchasesListener)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    fun connect() {
        if (client.isReady) return
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    _ready.value = true
                    queryProducts()
                    queryActiveSubscription()
                }
            }
            override fun onBillingServiceDisconnected() { _ready.value = false }
        })
    }

    /// Cache which subscription is already owned, so a later plan change can be
    /// launched as a replacement rather than a new purchase.
    private fun queryActiveSubscription() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync
            _activeProductId.value = purchases
                .firstOrNull { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                ?.products?.firstOrNull()
        }
    }

    private fun queryProducts() {
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(MONTHLY, YEARLY, FAMILY).map { id ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                }
            ).build()
        client.queryProductDetailsAsync(params) { result, details ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                // Billing 9.0.0: the callback yields a QueryProductDetailsResult,
                // not a bare List<ProductDetails>.
                _products.value = details.productDetailsList.sortedBy { priceMicros(it) }
            }
        }
    }

    fun launchPurchase(activity: Activity, product: ProductDetails) {
        val offerToken = product.subscriptionOfferDetails?.firstOrNull()?.offerToken ?: return
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product)
            .setOfferToken(offerToken)

        // Already on a different plan (e.g. solo Pro switching to Family)? Play
        // needs this marked as a replacement or it fails with ITEM_ALREADY_OWNED.
        // CHARGE_PRORATED_PRICE credits the unused remainder of the current plan.
        val old = _activeProductId.value
        if (old != null && old != product.productId) {
            productParams.setSubscriptionProductReplacementParams(
                BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.newBuilder()
                    .setOldProductId(old)
                    .setReplacementMode(
                        BillingFlowParams.ProductDetailsParams
                            .SubscriptionProductReplacementParams.ReplacementMode.CHARGE_PRORATED_PRICE
                    )
                    .build()
            )
        }

        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams.build()))
            .build()
        client.launchBillingFlow(activity, params)
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        val productId = purchase.products.firstOrNull() ?: return
        // The plan the user now owns — so a subsequent change replaces *this*.
        _activeProductId.value = productId
        onPurchase(productId, purchase.purchaseToken)
        if (!purchase.isAcknowledged) {
            client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken).build()
            ) { /* server already recorded it; ack is best-effort */ }
        }
    }

    fun endConnection() { runCatching { client.endConnection() } }

    companion object {
        const val MONTHLY = "app.fihaven.pro.monthly"
        const val YEARLY = "app.fihaven.pro.yearly"

        /// Family plan. `queryProductDetailsAsync` returns only the ids that
        /// exist in Play Console, so listing this before the product is live
        /// simply means it doesn't appear in the paywall.
        const val FAMILY = "app.fihaven.pro.family"

        fun formattedPrice(p: ProductDetails): String? =
            p.subscriptionOfferDetails?.firstOrNull()
                ?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice

        fun period(p: ProductDetails): String? =
            when (p.subscriptionOfferDetails?.firstOrNull()
                ?.pricingPhases?.pricingPhaseList?.firstOrNull()?.billingPeriod) {
                "P1M" -> "Monthly"
                "P1Y" -> "Yearly"
                "P1W" -> "Weekly"
                else -> null
            }

        private fun priceMicros(p: ProductDetails): Long =
            p.subscriptionOfferDetails?.firstOrNull()
                ?.pricingPhases?.pricingPhaseList?.firstOrNull()?.priceAmountMicros ?: Long.MAX_VALUE
    }
}
