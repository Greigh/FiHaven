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
        // Monthly and yearly carry a free-trial offer alongside the bare base
        // plan. Play returns both in an unspecified order, so pick the trial
        // explicitly — taking whatever came first would silently charge some
        // users on day one despite the advertised 7-day trial.
        val offers = product.subscriptionOfferDetails.orEmpty()
        val offerToken = (
            offers.firstOrNull { offer ->
                offer.pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L }
            } ?: offers.firstOrNull()
        )?.offerToken ?: return
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

        /// Family plan. Note the id is *not* `app.fihaven.pro.family` — Play
        /// Console was created as `…family.yearly` and product ids can't be
        /// renamed after the fact, so this is the id of record on Android and
        /// the server maps both (server/billing.js DEFAULT_PRODUCTS). iOS keeps
        /// `app.fihaven.pro.family`.
        ///
        /// `queryProductDetailsAsync` returns only the ids that exist in Play
        /// Console, so a missing product simply doesn't appear in the paywall.
        const val FAMILY = "app.fihaven.pro.family.yearly"

        /// The recurring base-plan phase. A base plan with a free-trial offer
        /// attached reports *two* pricing phases — the $0.00 trial first, then
        /// the real one — and Play doesn't guarantee which offer comes first in
        /// `subscriptionOfferDetails`. Reading `.first()` therefore renders the
        /// plan as "Free" and sorts it to the top; the last phase is always the
        /// recurring one, whichever offer got picked.
        private fun basePhase(p: ProductDetails) =
            p.subscriptionOfferDetails?.firstOrNull()
                ?.pricingPhases?.pricingPhaseList?.lastOrNull()

        fun formattedPrice(p: ProductDetails): String? = basePhase(p)?.formattedPrice

        fun period(p: ProductDetails): String? =
            when (basePhase(p)?.billingPeriod) {
                "P1M" -> "Length: 1 month · auto-renewing"
                "P1Y" -> "Length: 1 year · auto-renewing"
                "P1W" -> "Length: 1 week · auto-renewing"
                else -> null
            }

        /** Short title for plan buttons (product name from Play, else period). */
        fun planTitle(p: ProductDetails): String =
            p.name.ifBlank { period(p)?.substringBefore(" ·") ?: "FiHaven Pro" }

        private fun priceMicros(p: ProductDetails): Long =
            basePhase(p)?.priceAmountMicros ?: Long.MAX_VALUE
    }
}
