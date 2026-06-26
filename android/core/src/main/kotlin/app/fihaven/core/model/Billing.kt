package app.fihaven.core.model

import kotlinx.serialization.Serializable

/** Effective Pro entitlement, derived server-side from store subscriptions
 *  + promo grants (docs/native-contract.md §billing). `source` is
 *  "apple" | "google" | "promo" | null; `expiresAt` is epoch-ms. */
@Serializable
data class Entitlement(
    val pro: Boolean = false,
    val source: String? = null,
    val productId: String? = null,
    val plan: String? = null,
    val expiresAt: Long? = null,
    val autoRenew: Boolean? = null,
    // Epoch-ms when the current Pro run began — a rough "Pro since" for the
    // profile. null when not Pro (or unknown from an older payload).
    val proSince: Long? = null,
    // How many people a shared household may hold (0 = can't create one).
    // Free 0, Pro 3, Family more. (Phase 4, pricing TBD.)
    val householdMax: Int? = null,
)

/** Native store offer returned when a `store_offer` promo is redeemed. */
@Serializable
data class StoreOffer(
    val platform: String? = null,
    val productId: String? = null,
    val offerId: String? = null,
)

/** Result of redeeming a promo code. */
@Serializable
data class PromoResult(
    val ok: Boolean = false,
    val kind: String? = null,            // "free_sub" | "store_offer"
    val offer: StoreOffer? = null,
    val entitlement: Entitlement? = null,
)
