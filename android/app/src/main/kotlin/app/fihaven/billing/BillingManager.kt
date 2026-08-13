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
import java.text.NumberFormat
import java.util.Currency

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
                    replayPurchases()
                }
            }
            override fun onBillingServiceDisconnected() { _ready.value = false }
        })
    }

    /// Cache which subscription is already owned, so a later plan change can be
    /// launched as a replacement rather than a new purchase — and re-present it
    /// to the server.
    ///
    /// The replay is what makes "Restore purchases" mean anything. Asking our
    /// own server for the entitlement only surfaces subscriptions it has
    /// already been told about, so a reinstall, a new FiHaven account, or a
    /// purchase whose original verify call failed would all restore to nothing
    /// while Play still bills the user. Unlike StoreKit's `finish()`, a Play
    /// purchase keeps coming back from `queryPurchasesAsync`, so replaying it
    /// is always possible — we just never did it.
    fun replayPurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync
            val owned = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            _activeProductId.value = owned.firstOrNull()?.products?.firstOrNull()
            owned.forEach { handlePurchase(it) }
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
        val offerToken = selectedOffer(product)?.offerToken ?: return
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

        /// The offer the user will actually be charged under — the one carrying
        /// a free trial when there is one. `launchPurchase` picks it this way,
        /// so the paywall has to read prices and trial terms from the *same*
        /// offer or it would describe a deal the purchase doesn't use.
        private fun selectedOffer(p: ProductDetails) =
            p.subscriptionOfferDetails.orEmpty().let { offers ->
                offers.firstOrNull { offer ->
                    offer.pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L }
                } ?: offers.firstOrNull()
            }

        /// The recurring base-plan phase. A base plan with a free-trial offer
        /// attached reports *two* pricing phases — the $0.00 trial first, then
        /// the real one. Reading `.first()` therefore renders the plan as
        /// "Free" and sorts it to the top; the last phase is always the
        /// recurring one, whichever offer got picked.
        private fun basePhase(p: ProductDetails) =
            selectedOffer(p)?.pricingPhases?.pricingPhaseList?.lastOrNull()

        /// ISO-8601 billing period → a human count, e.g. "P1W" → 7 days.
        /// Play states the 7-day trial as one week; say it the way the Play
        /// listing and the marketing site do.
        private fun periodWords(iso: String?, cycles: Int): String? {
            val m = Regex("""P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?""")
                .matchEntire(iso ?: return null) ?: return null
            val (y, mo, w, d) = m.destructured
            val repeats = if (cycles > 0) cycles else 1
            val (value, noun) = when {
                y.isNotEmpty() -> y.toInt() * repeats to "year"
                mo.isNotEmpty() -> mo.toInt() * repeats to "month"
                w.isNotEmpty() -> w.toInt() * 7 * repeats to "day"
                d.isNotEmpty() -> d.toInt() * repeats to "day"
                else -> return null
            }
            return "$value $noun${if (value == 1) "" else "s"}"
        }

        /// The introductory offer in plain words. Play's subscription policy —
        /// like Apple's Guideline 3.1.2 — requires the paywall to state that a
        /// trial exists, how long it runs, and what it turns into. The offer
        /// was already being *selected* for purchase but never described, so a
        /// user was shown "$1.99 / Length: 1 month" for a plan that actually
        /// starts free.
        fun introOffer(p: ProductDetails): String? {
            val phases = selectedOffer(p)?.pricingPhases?.pricingPhaseList ?: return null
            if (phases.size < 2) return null
            val intro = phases.first()
            val base = phases.last()
            val length = periodWords(intro.billingPeriod, intro.billingCycleCount) ?: return null
            val unit = periodWords(base.billingPeriod, 1)?.substringAfter(' ')?.removeSuffix("s")
                ?: return null
            val then = "then ${base.formattedPrice}/$unit"
            return if (intro.priceAmountMicros == 0L) "$length free, $then"
            else "${intro.formattedPrice} for $length, $then"
        }

        fun formattedPrice(p: ProductDetails): String? = basePhase(p)?.formattedPrice

        fun period(p: ProductDetails): String? =
            when (basePhase(p)?.billingPeriod) {
                "P1M" -> "Length: 1 month · auto-renewing"
                "P1Y" -> "Length: 1 year · auto-renewing"
                "P1W" -> "Length: 1 week · auto-renewing"
                else -> null
            }

        /** Bare billing unit ("year"), for prices written as "$29.99 / year". */
        fun periodUnit(p: ProductDetails): String? =
            when (basePhase(p)?.billingPeriod) {
                "P1M" -> "month"
                "P1Y" -> "year"
                "P1W" -> "week"
                else -> null
            }

        /** Short title for plan buttons (product name from Play, else period). */
        fun planTitle(p: ProductDetails): String =
            p.name.ifBlank { period(p)?.substringBefore(" ·") ?: "FiHaven Pro" }

        private fun priceMicros(p: ProductDetails): Long =
            basePhase(p)?.priceAmountMicros ?: Long.MAX_VALUE

        /** True for a yearly base plan — the one the paywall preselects. */
        fun isYearly(p: ProductDetails): Boolean = basePhase(p)?.billingPeriod == "P1Y"

        /**
         * Sort key so the best-value plan leads the list: yearly, then monthly,
         * then weekly. Unknown periods sort last.
         */
        fun intervalRank(p: ProductDetails): Int = when (basePhase(p)?.billingPeriod) {
            "P1Y" -> 3
            "P1M" -> 2
            "P1W" -> 1
            else -> 0
        }

        /**
         * "37" for a "Save 37%" badge on [yearly], measured against twelve
         * months of [monthly]. Null unless both plans exist on this storefront,
         * are priced in the same currency, and the saving is worth stating —
         * the badge must always be derivable from the two prices on screen.
         */
        fun savingsPercent(yearly: ProductDetails, monthly: ProductDetails): Int? {
            val yearPhase = basePhase(yearly) ?: return null
            val monthPhase = basePhase(monthly) ?: return null
            if (yearPhase.billingPeriod != "P1Y" || monthPhase.billingPeriod != "P1M") return null
            if (yearPhase.priceCurrencyCode != monthPhase.priceCurrencyCode) return null
            val twelveMonths = monthPhase.priceAmountMicros * 12
            if (twelveMonths <= 0 || yearPhase.priceAmountMicros >= twelveMonths) return null
            val pct = Math.round(
                (twelveMonths - yearPhase.priceAmountMicros) * 100.0 / twelveMonths
            ).toInt()
            return if (pct >= 5) pct else null
        }

        /**
         * A yearly price restated per month ("$1.25/mo billed annually").
         *
         * Formatted with the offer's OWN currency code rather than whatever the
         * device locale implies, so someone on the US store with their phone set
         * to Japan is not shown a dollar amount wearing a yen sign.
         */
        fun perMonthLabel(p: ProductDetails): String? {
            val phase = basePhase(p) ?: return null
            if (phase.billingPeriod != "P1Y") return null
            val fmt = NumberFormat.getCurrencyInstance()
            runCatching { fmt.currency = Currency.getInstance(phase.priceCurrencyCode) }
            return "${fmt.format(phase.priceAmountMicros / 12 / 1_000_000.0)}/mo billed annually"
        }

        /**
         * The trial length ("7 days") when the offer that will actually be
         * charged starts free — used to label the CTA honestly. Null when there
         * is no trial or the intro phase costs money, in which case the button
         * must not promise anything free.
         */
        fun freeTrialLength(p: ProductDetails): String? {
            val phases = selectedOffer(p)?.pricingPhases?.pricingPhaseList ?: return null
            if (phases.size < 2) return null
            val intro = phases.first()
            if (intro.priceAmountMicros != 0L) return null
            return periodWords(intro.billingPeriod, intro.billingCycleCount)
        }
    }
}
