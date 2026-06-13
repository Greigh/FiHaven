package com.danielhipskind.fihaven.core.logic

import com.danielhipskind.fihaven.core.model.Card
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * "Which card should I use?" optimizer. Mirrors client/js/rewards.js.
 *
 * A card inside an active 0% promo window is deliberately EXCLUDED from
 * recommendations: the payoff engine pays 0% balances last, so new rewards
 * spend there grows untouched and starts accruing interest once the promo
 * ends — no reward rate is worth that.
 */
object Rewards {
    /** Spending categories offered by the optimizer (kept in sync with web + iOS). */
    val CATEGORIES = listOf(
        "Dining", "Groceries", "Gas", "Travel",
        "Transit", "Online shopping", "Streaming", "Drugstores", "Other",
    )

    /** One card ranked for a category; [reason] is set only when excluded. */
    data class Ranked(val card: Card, val rate: Double, val reason: String? = null)

    data class Ranking(val eligible: List<Ranked>, val excluded: List<Ranked>)

    /**
     * A popular card the user can pick to auto-fill its reward profile. Rates are
     * typical 2025 published defaults and stay editable after import. Mirrors
     * CARD_PRESETS in client/js/cardPresets.js.
     */
    data class CardPreset(
        val id: String,
        val issuer: String,
        val name: String,
        val network: String,
        val rewardBase: Double,
        val rewardCategories: Map<String, Double>,
    ) {
        val label: String get() = "$issuer $name"
    }

    val CARD_PRESETS = listOf(
        CardPreset("amex-gold", "American Express", "Gold Card", "Amex", 1.0, mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0)),
        CardPreset("amex-bcp", "American Express", "Blue Cash Preferred", "Amex", 1.0, mapOf("Groceries" to 6.0, "Streaming" to 6.0, "Gas" to 3.0, "Transit" to 3.0)),
        CardPreset("amex-bce", "American Express", "Blue Cash Everyday", "Amex", 1.0, mapOf("Groceries" to 3.0, "Online shopping" to 3.0, "Gas" to 3.0)),
        CardPreset("chase-csp", "Chase", "Sapphire Preferred", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 2.0, "Streaming" to 3.0, "Online shopping" to 3.0)),
        CardPreset("chase-csr", "Chase", "Sapphire Reserve", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0)),
        CardPreset("chase-cfu", "Chase", "Freedom Unlimited", "Visa", 1.5, mapOf("Dining" to 3.0, "Drugstores" to 3.0, "Travel" to 5.0)),
        CardPreset("citi-double", "Citi", "Double Cash", "Mastercard", 2.0, emptyMap()),
        CardPreset("capone-savorone", "Capital One", "SavorOne", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Streaming" to 3.0, "Groceries" to 3.0)),
        CardPreset("capone-quicksilver", "Capital One", "Quicksilver", "Mastercard", 1.5, emptyMap()),
        CardPreset("capone-venture", "Capital One", "Venture", "Visa", 2.0, mapOf("Travel" to 5.0)),
        CardPreset("wf-active-cash", "Wells Fargo", "Active Cash", "Visa", 2.0, emptyMap()),
        CardPreset("wf-autograph", "Wells Fargo", "Autograph", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0, "Gas" to 3.0, "Transit" to 3.0, "Streaming" to 3.0)),
        CardPreset("discover-it", "Discover", "it Cash Back", "Discover", 1.0, emptyMap()),
        CardPreset("apple-card", "Apple", "Apple Card", "Mastercard", 2.0, emptyMap()),
        CardPreset("usbank-altitude-go", "U.S. Bank", "Altitude Go", "Visa", 1.0, mapOf("Dining" to 4.0, "Streaming" to 3.0, "Groceries" to 2.0, "Gas" to 2.0)),
        CardPreset("boa-customized", "Bank of America", "Customized Cash", "Visa", 1.0, mapOf("Gas" to 3.0, "Online shopping" to 3.0)),
    )

    /** Per-category multiplier when set (> 0), otherwise the flat base rate. */
    fun effectiveRate(card: Card, category: String): Double {
        val v = card.rewardCategories[category]
        return if (v != null && v > 0) v else card.rewardBase
    }

    /** True while a card is inside an active 0% promo window (today < end). */
    fun inActivePromo(card: Card, zone: ZoneId, now: Instant = Instant.now()): Boolean {
        if (!card.hasPromo) return false
        val end = DateLogic.parseDate(card.promoEndDate) ?: return false
        return !end.isBefore(DateLogic.today(zone, now))
    }

    /**
     * Rank cards for a spending category. Loans never earn rewards and are
     * dropped; cards in an active 0% promo go to [Ranking.excluded] with a reason.
     */
    fun rank(cards: List<Card>, category: String, zone: ZoneId, now: Instant = Instant.now()): Ranking {
        val eligible = mutableListOf<Ranked>()
        val excluded = mutableListOf<Ranked>()
        for (c in cards) {
            if (c.type == "loan") continue
            val rate = effectiveRate(c, category)
            if (inActivePromo(c, zone, now)) {
                excluded.add(Ranked(c, rate, promoReason(c)))
            } else {
                eligible.add(Ranked(c, rate))
            }
        }
        eligible.sortByDescending { it.rate }
        excluded.sortByDescending { it.rate }
        return Ranking(eligible, excluded)
    }

    private fun promoReason(card: Card): String {
        val end = DateLogic.parseDate(card.promoEndDate)
        val label = if (end != null) {
            "0% promo until " + end.format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.US))
        } else {
            "its 0% promo"
        }
        return "$label — new spend isn’t prioritized for payoff and can accrue interest later."
    }
}
