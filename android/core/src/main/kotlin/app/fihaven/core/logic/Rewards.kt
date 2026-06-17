package app.fihaven.core.logic

import app.fihaven.core.model.Card
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

    /**
     * One card ranked for a category; [reason] is set only when excluded.
     * [rate] is the raw multiplier; [value] is the cash-equivalent return we
     * rank by (rate × pointValue).
     */
    data class Ranked(
        val card: Card,
        val rate: Double,
        val pointValue: Double = 1.0,
        val value: Double = rate * pointValue,
        val reason: String? = null,
    )

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
        val rotatingRate: Double? = null,        // elevated rate for rotating cards
        val rotatingPool: List<String>? = null,  // categories that can earn it when active
        val pointValue: Double? = null,          // cents per point (null → 1 = cash back)
    ) {
        val label: String get() = "$issuer $name"
    }

    val CARD_PRESETS = listOf(
        // American Express
        CardPreset("amex-gold", "American Express", "Gold Card", "Amex", 1.0, mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0), pointValue = 2.0),
        CardPreset("amex-platinum", "American Express", "Platinum Card", "Amex", 1.0, mapOf("Travel" to 5.0), pointValue = 2.0),
        CardPreset("amex-green", "American Express", "Green Card", "Amex", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0, "Transit" to 3.0), pointValue = 2.0),
        CardPreset("amex-bcp", "American Express", "Blue Cash Preferred", "Amex", 1.0, mapOf("Groceries" to 6.0, "Streaming" to 6.0, "Gas" to 3.0, "Transit" to 3.0)),
        CardPreset("amex-bce", "American Express", "Blue Cash Everyday", "Amex", 1.0, mapOf("Groceries" to 3.0, "Online shopping" to 3.0, "Gas" to 3.0)),
        // Chase
        CardPreset("chase-csp", "Chase", "Sapphire Preferred", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 2.0, "Streaming" to 3.0, "Online shopping" to 3.0), pointValue = 2.0),
        CardPreset("chase-csr", "Chase", "Sapphire Reserve", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0), pointValue = 2.0),
        CardPreset("chase-cfu", "Chase", "Freedom Unlimited", "Visa", 1.5, mapOf("Dining" to 3.0, "Drugstores" to 3.0, "Travel" to 5.0), pointValue = 1.5),
        CardPreset("chase-cff", "Chase", "Freedom Flex", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Drugstores" to 3.0, "Travel" to 5.0), 5.0, listOf("Gas", "Groceries", "Transit", "Online shopping", "Streaming"), pointValue = 1.5),
        CardPreset("chase-amazon", "Chase", "Amazon Prime Visa", "Visa", 1.0, mapOf("Online shopping" to 5.0, "Dining" to 2.0, "Gas" to 2.0, "Transit" to 2.0, "Drugstores" to 2.0)),
        // Citi
        CardPreset("citi-double", "Citi", "Double Cash", "Mastercard", 2.0, emptyMap()),
        CardPreset("citi-strata", "Citi", "Strata Premier", "Mastercard", 1.0, mapOf("Travel" to 3.0, "Dining" to 3.0, "Groceries" to 3.0, "Gas" to 3.0), pointValue = 1.8),
        CardPreset("citi-custom-cash", "Citi", "Custom Cash", "Mastercard", 1.0, emptyMap(), 5.0, listOf("Dining", "Groceries", "Gas", "Travel", "Transit", "Streaming", "Drugstores")),
        CardPreset("citi-costco", "Citi", "Costco Anywhere Visa", "Visa", 1.0, mapOf("Gas" to 4.0, "Dining" to 3.0, "Travel" to 3.0)),
        // Capital One
        CardPreset("capone-savorone", "Capital One", "SavorOne", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Streaming" to 3.0, "Groceries" to 3.0)),
        CardPreset("capone-savor", "Capital One", "Savor", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Streaming" to 3.0, "Groceries" to 3.0)),
        CardPreset("capone-quicksilver", "Capital One", "Quicksilver", "Mastercard", 1.5, emptyMap()),
        CardPreset("capone-venture", "Capital One", "Venture", "Visa", 2.0, mapOf("Travel" to 5.0), pointValue = 1.85),
        CardPreset("capone-venturex", "Capital One", "Venture X", "Visa", 2.0, mapOf("Travel" to 5.0), pointValue = 1.85),
        // Wells Fargo
        CardPreset("wf-active-cash", "Wells Fargo", "Active Cash", "Visa", 2.0, emptyMap()),
        CardPreset("wf-autograph", "Wells Fargo", "Autograph", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0, "Gas" to 3.0, "Transit" to 3.0, "Streaming" to 3.0), pointValue = 1.5),
        // Bank of America
        CardPreset("boa-customized", "Bank of America", "Customized Cash", "Visa", 1.0, mapOf("Gas" to 3.0, "Online shopping" to 3.0)),
        CardPreset("boa-travel", "Bank of America", "Travel Rewards", "Visa", 1.5, emptyMap()),
        CardPreset("boa-premium", "Bank of America", "Premium Rewards", "Visa", 1.5, mapOf("Travel" to 2.0, "Dining" to 2.0)),
        // U.S. Bank
        CardPreset("usbank-altitude-go", "U.S. Bank", "Altitude Go", "Visa", 1.0, mapOf("Dining" to 4.0, "Streaming" to 3.0, "Groceries" to 2.0, "Gas" to 2.0)),
        CardPreset("usbank-cashplus", "U.S. Bank", "Cash+", "Visa", 1.0, emptyMap(), 5.0, listOf("Gas", "Streaming", "Groceries", "Online shopping", "Transit", "Drugstores")),
        // Discover
        CardPreset("discover-it", "Discover", "it Cash Back", "Discover", 1.0, emptyMap(), 5.0, listOf("Gas", "Groceries", "Dining", "Online shopping", "Transit", "Drugstores")),
        // Other
        CardPreset("apple-card", "Apple", "Apple Card", "Mastercard", 2.0, emptyMap()),
        CardPreset("bilt", "Bilt", "Bilt Mastercard", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Travel" to 2.0), pointValue = 2.2),
        CardPreset("sofi", "SoFi", "SoFi Credit Card", "Mastercard", 2.0, emptyMap()),
        CardPreset("paypal", "PayPal", "Cashback Mastercard", "Mastercard", 1.5, mapOf("Online shopping" to 3.0)),
        CardPreset("target-redcard", "Target", "RedCard", "Mastercard", 1.0, mapOf("Other" to 5.0)),
    )

    /** Best-effort preset match from a typed card name (and optional issuer). */
    fun suggestCardPreset(name: String, issuer: String = ""): CardPreset? {
        val q = "$name $issuer".trim().lowercase()
        if (q.isEmpty()) return null
        var best: CardPreset? = null
        var bestScore = 0
        for (p in CARD_PRESETS) {
            var score = 0
            val pn = p.name.lowercase()
            val pi = p.issuer.lowercase()
            val full = "$pi $pn"
            if (q == pn || q == full) score += 20
            if (q.contains(pn) || pn.contains(q)) score += 10
            if (issuer.isNotBlank() && pi.contains(issuer.lowercase())) score += 5
            for (t in q.split(' ')) {
                if (t.length >= 3 && (pn.contains(t) || pi.contains(t))) score += 2
            }
            if (score > bestScore) { bestScore = score; best = p }
        }
        return if (bestScore >= 4) best else null
    }

    /** Per-category multiplier when set (> 0), otherwise the flat base rate. */
    fun effectiveRate(card: Card, category: String): Double {
        val v = card.rewardCategories[category]
        return if (v != null && v > 0) v else card.rewardBase
    }

    /** Cents per point/mile (null/≤0 → 1 = cash back). */
    fun pointValue(card: Card): Double = card.pointValue?.takeIf { it > 0 } ?: 1.0

    /** Cash-equivalent return % for a category: multiplier × point value. */
    fun effectiveValue(card: Card, category: String): Double =
        effectiveRate(card, category) * pointValue(card)

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
            val pv = pointValue(c)
            if (inActivePromo(c, zone, now)) {
                excluded.add(Ranked(c, rate, pv, rate * pv, promoReason(c)))
            } else {
                eligible.add(Ranked(c, rate, pv, rate * pv))
            }
        }
        eligible.sortByDescending { it.value }
        excluded.sortByDescending { it.value }
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
