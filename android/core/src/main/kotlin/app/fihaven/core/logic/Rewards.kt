package app.fihaven.core.logic

import app.fihaven.core.model.Card
import app.fihaven.core.model.SpendTransaction
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToLong

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
        val updatedAt: Double? = null,           // catalog stamp from server (ms)
    ) {
        val label: String get() = "$issuer $name"
    }

    /** Bundled defaults. Runtime catalog is [activePresets] (may be replaced from the server). */
    val CARD_PRESETS = listOf(
        // American Express
        CardPreset("amex-gold", "American Express", "Gold Card", "Amex", 1.0, mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0), pointValue = 2.0),
        CardPreset("amex-platinum", "American Express", "Platinum Card", "Amex", 1.0, mapOf("Travel" to 5.0), pointValue = 2.0),
        CardPreset("amex-green", "American Express", "Green Card", "Amex", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0, "Transit" to 3.0), pointValue = 2.0),
        CardPreset("amex-bcp", "American Express", "Blue Cash Preferred", "Amex", 1.0, mapOf("Groceries" to 6.0, "Streaming" to 6.0, "Gas" to 3.0, "Transit" to 3.0)),
        CardPreset("amex-bce", "American Express", "Blue Cash Everyday", "Amex", 1.0, mapOf("Groceries" to 3.0, "Online shopping" to 3.0, "Gas" to 3.0)),
        // Chase
        CardPreset("chase-csp", "Chase", "Sapphire Preferred", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 2.0, "Streaming" to 3.0, "Gas" to 3.0), pointValue = 2.0),
        CardPreset("chase-csr", "Chase", "Sapphire Reserve", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 4.0), pointValue = 2.0),
        CardPreset("chase-cfu", "Chase", "Freedom Unlimited", "Visa", 1.5, mapOf("Dining" to 3.0, "Drugstores" to 3.0, "Travel" to 5.0), pointValue = 1.5),
        CardPreset("chase-cff", "Chase", "Freedom Flex", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Drugstores" to 3.0, "Travel" to 5.0), 5.0, listOf("Gas", "Groceries", "Transit", "Online shopping", "Streaming"), pointValue = 1.5),
        CardPreset("chase-amazon", "Chase", "Amazon Prime Visa", "Visa", 1.0, mapOf("Online shopping" to 5.0, "Dining" to 2.0, "Gas" to 2.0, "Transit" to 2.0, "Drugstores" to 2.0)),
        CardPreset("chase-southwest-priority", "Chase", "Southwest Priority", "Visa", 1.0, mapOf("Travel" to 4.0, "Dining" to 2.0, "Gas" to 2.0), pointValue = 1.3),
        // Citi
        CardPreset("citi-double", "Citi", "Double Cash", "Mastercard", 2.0, emptyMap()),
        CardPreset("citi-strata", "Citi", "Strata Premier", "Mastercard", 1.0, mapOf("Travel" to 3.0, "Dining" to 3.0, "Groceries" to 3.0, "Gas" to 3.0), pointValue = 1.8),
        CardPreset("citi-strata-elite", "Citi", "Strata Elite", "Mastercard", 1.5, mapOf("Dining" to 3.0, "Travel" to 3.0), pointValue = 1.8),
        CardPreset("citi-custom-cash", "Citi", "Custom Cash", "Mastercard", 1.0, emptyMap(), 5.0, listOf("Dining", "Groceries", "Gas", "Travel", "Transit", "Streaming", "Drugstores")),
        CardPreset("citi-costco", "Citi", "Costco Anywhere Visa", "Visa", 1.0, mapOf("Gas" to 4.0, "Dining" to 3.0, "Travel" to 3.0)),
        // Capital One
        CardPreset("capone-savorone", "Capital One", "SavorOne", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Streaming" to 3.0, "Groceries" to 3.0)),
        CardPreset("capone-savor", "Capital One", "Savor", "Mastercard", 1.0, mapOf("Dining" to 3.0, "Streaming" to 3.0, "Groceries" to 3.0)),
        CardPreset("capone-quicksilver", "Capital One", "Quicksilver", "Mastercard", 1.5, emptyMap()),
        CardPreset("capone-ventureone", "Capital One", "VentureOne", "Visa", 1.25, mapOf("Travel" to 5.0), pointValue = 1.85),
        CardPreset("capone-venture", "Capital One", "Venture", "Visa", 2.0, mapOf("Travel" to 5.0), pointValue = 1.85),
        CardPreset("capone-venturex", "Capital One", "Venture X", "Visa", 2.0, mapOf("Travel" to 5.0), pointValue = 1.85),
        // Wells Fargo
        CardPreset("wf-active-cash", "Wells Fargo", "Active Cash", "Visa", 2.0, emptyMap()),
        CardPreset("wf-autograph", "Wells Fargo", "Autograph", "Visa", 1.0, mapOf("Dining" to 3.0, "Travel" to 3.0, "Gas" to 3.0, "Transit" to 3.0, "Streaming" to 3.0), pointValue = 1.5),
        CardPreset("wf-autograph-journey", "Wells Fargo", "Autograph Journey", "Visa", 1.0, mapOf("Travel" to 4.0, "Dining" to 3.0), pointValue = 1.5),
        // Bank of America
        CardPreset("boa-customized", "Bank of America", "Customized Cash", "Visa", 1.0, mapOf("Gas" to 3.0, "Online shopping" to 3.0)),
        CardPreset("boa-travel", "Bank of America", "Travel Rewards", "Visa", 1.5, emptyMap()),
        CardPreset("boa-premium", "Bank of America", "Premium Rewards", "Visa", 1.5, mapOf("Travel" to 2.0, "Dining" to 2.0)),
        // U.S. Bank
        CardPreset("usbank-altitude-go", "U.S. Bank", "Altitude Go", "Visa", 1.0, mapOf("Dining" to 4.0, "Streaming" to 3.0, "Groceries" to 2.0, "Gas" to 2.0)),
        CardPreset("usbank-altitude-connect", "U.S. Bank", "Altitude Connect", "Visa", 1.0, mapOf("Travel" to 4.0, "Gas" to 4.0, "Dining" to 2.0, "Streaming" to 2.0, "Groceries" to 2.0), pointValue = 1.0),
        CardPreset("usbank-cashplus", "U.S. Bank", "Cash+", "Visa", 1.0, emptyMap(), 5.0, listOf("Gas", "Streaming", "Groceries", "Online shopping", "Transit", "Drugstores")),
        // Discover
        CardPreset("discover-it", "Discover", "it Cash Back", "Discover", 1.0, emptyMap(), 5.0, listOf("Gas", "Groceries", "Dining", "Online shopping", "Transit", "Drugstores")),
        CardPreset("discover-it-miles", "Discover", "it Miles", "Discover", 1.5, emptyMap(), pointValue = 1.0),
        // Bilt 2.0
        CardPreset("bilt-blue", "Bilt", "Blue Card", "Mastercard", 1.0, mapOf("Travel" to 2.0, "Transit" to 3.0), pointValue = 2.2),
        CardPreset("bilt-obsidian", "Bilt", "Obsidian Card", "Mastercard", 1.0, mapOf("Travel" to 2.0), 3.0, listOf("Dining", "Groceries"), pointValue = 2.2),
        CardPreset("bilt-palladium", "Bilt", "Palladium Card", "Mastercard", 2.0, mapOf("Travel" to 3.0, "Transit" to 4.0), pointValue = 2.2),
        // Co-brand / other
        CardPreset("apple-card", "Apple", "Apple Card", "Mastercard", 2.0, emptyMap()),
        CardPreset("amex-hilton-surpass", "American Express", "Hilton Honors Surpass", "Amex", 1.0, mapOf("Travel" to 12.0, "Dining" to 6.0, "Groceries" to 6.0, "Gas" to 6.0), pointValue = 0.6),
        CardPreset("robinhood-gold", "Robinhood", "Gold Card", "Mastercard", 3.0, emptyMap()),
        CardPreset("fidelity", "Fidelity", "Rewards Visa", "Visa", 2.0, emptyMap()),
        CardPreset("sofi", "SoFi", "SoFi Credit Card", "Mastercard", 2.0, emptyMap()),
        CardPreset("paypal", "PayPal", "Cashback Mastercard", "Mastercard", 1.5, mapOf("Online shopping" to 3.0)),
        CardPreset("target-redcard", "Target", "RedCard", "Mastercard", 1.0, mapOf("Other" to 5.0)),
    )

    @Volatile private var _activePresets: List<CardPreset>? = null

    /** Runtime catalog (server copy when available). Falls back to bundled defaults. */
    val activePresets: List<CardPreset>
        get() = _activePresets ?: CARD_PRESETS

    /** Replace the in-memory catalog with the server copy (admin-editable). */
    fun replaceActivePresets(list: List<CardPreset>) {
        _activePresets = list.takeIf { it.isNotEmpty() }
    }

    fun presetById(id: String): CardPreset? = activePresets.firstOrNull { it.id == id }

    /** Best-effort preset match from a typed card name (and optional issuer). */
    fun suggestCardPreset(name: String, issuer: String = ""): CardPreset? {
        val q = "$name $issuer".trim().lowercase()
        if (q.isEmpty()) return null
        var best: CardPreset? = null
        var bestScore = 0
        for (p in activePresets) {
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

    data class ShippedRate(val rate: Double?, val preset: CardPreset?)

    /**
     * Rate FiHaven ships for a card+category (shared preset catalog — not the
     * user's possibly-edited local card).
     */
    fun shippedRewardRate(
        card: Card,
        category: String,
        baseLabel: String = "Base rate (everything)",
    ): ShippedRate {
        val preset = card.presetId?.let { presetById(it) }
            ?: suggestCardPreset(card.name, card.issuer ?: "")
            ?: return ShippedRate(null, null)
        if (category == baseLabel) return ShippedRate(preset.rewardBase, preset)
        preset.rewardCategories[category]?.let { return ShippedRate(it, preset) }
        if (preset.rotatingPool?.contains(category) == true && preset.rotatingRate != null) {
            return ShippedRate(preset.rotatingRate, preset)
        }
        return ShippedRate(null, preset)
    }

    data class PendingPresetUpdate(val card: Card, val preset: CardPreset)

    private fun numOr(v: Double?, fallback: Double): Double = v ?: fallback

    private fun catsEqual(a: Map<String, Double>, b: Map<String, Double>): Boolean {
        val keys = a.keys + b.keys
        return keys.all { numOr(a[it], 0.0) == numOr(b[it], 0.0) }
    }

    /** True when the card's earn rates match the catalog preset. */
    fun cardRatesMatchPreset(card: Card, preset: CardPreset): Boolean {
        if (numOr(card.rewardBase, 0.0) != numOr(preset.rewardBase, 0.0)) return false
        if (numOr(card.pointValue, 1.0) != numOr(preset.pointValue, 1.0)) return false
        if (!catsEqual(card.rewardCategories, preset.rewardCategories)) return false
        val poolA = (card.rotatingPool ?: emptyList()).sorted().joinToString("|")
        val poolB = (preset.rotatingPool ?: emptyList()).sorted().joinToString("|")
        if (poolA != poolB) return false
        if (poolA.isNotEmpty() && numOr(card.rotatingRate, 5.0) != numOr(preset.rotatingRate, 5.0)) return false
        return true
    }

    /** Copy catalog earn rates onto a card (does not touch identity fields). */
    fun applyPresetRates(card: Card, preset: CardPreset): Card = card.copy(
        rewardBase = preset.rewardBase,
        rewardCategories = preset.rewardCategories,
        pointValue = preset.pointValue,
        rotatingPool = preset.rotatingPool,
        rotatingRate = if (!preset.rotatingPool.isNullOrEmpty()) (preset.rotatingRate ?: 5.0) else null,
        presetId = preset.id,
        acceptedPresetUpdatedAt = preset.updatedAt ?: card.acceptedPresetUpdatedAt,
        // Accepting catalog rates clears any prior "Keep mine" for this (or older) stamp.
        declinedPresetUpdatedAt = null,
    )

    /**
     * Resolve the catalog preset for a user card. When [attachIfMatch] is true and
     * rates already match, returns a card with presetId stamped.
     */
    fun resolveCardPreset(card: Card, attachIfMatch: Boolean = false): Pair<Card, CardPreset?> {
        if (card.type == "loan") return card to null
        var preset = card.presetId?.let { presetById(it) }
        if (preset == null) preset = suggestCardPreset(card.name, card.issuer ?: "")
        var next = card
        if (attachIfMatch && preset != null && card.presetId == null && cardRatesMatchPreset(card, preset)) {
            next = card.copy(
                presetId = preset.id,
                acceptedPresetUpdatedAt = preset.updatedAt ?: card.acceptedPresetUpdatedAt,
            )
        }
        return next to preset
    }

    /**
     * Cards whose linked catalog preset has newer rates the user hasn't accepted
     * or declined. Quietly stamps acceptance when rates already match.
     * Returns (updatedCards, pending).
     */
    fun findPendingPresetUpdates(cards: List<Card>): Pair<List<Card>, List<PendingPresetUpdate>> {
        val out = mutableListOf<PendingPresetUpdate>()
        val updated = cards.toMutableList()
        for (i in updated.indices) {
            val card = updated[i]
            if (card.archived || card.type == "loan") continue
            val (resolved, preset) = resolveCardPreset(card, attachIfMatch = true)
            updated[i] = resolved
            if (preset == null || resolved.presetId == null) continue
            if (cardRatesMatchPreset(resolved, preset)) {
                val u = preset.updatedAt
                if (u != null && (resolved.acceptedPresetUpdatedAt == null || resolved.acceptedPresetUpdatedAt!! < u)) {
                    updated[i] = resolved.copy(acceptedPresetUpdatedAt = u)
                }
                continue
            }
            val updatedAt = preset.updatedAt ?: 0.0
            val declined = resolved.declinedPresetUpdatedAt
            val accepted = resolved.acceptedPresetUpdatedAt
            if (updatedAt > 0 && declined != null && declined >= updatedAt) continue
            if (updatedAt > 0 && accepted != null && accepted >= updatedAt) continue
            if (updatedAt == 0.0 && declined == 0.0) continue
            out.add(PendingPresetUpdate(updated[i], preset))
        }
        return updated to out
    }

    fun formatRateDiff(card: Card, preset: CardPreset): String {
        val lines = mutableListOf<String>()
        val baseA = numOr(card.rewardBase, 0.0)
        val baseB = numOr(preset.rewardBase, 0.0)
        if (baseA != baseB) lines.add("Base: $baseA% → $baseB%")
        val keys = (card.rewardCategories.keys + preset.rewardCategories.keys).sorted()
        for (k in keys) {
            val a = numOr(card.rewardCategories[k], 0.0)
            val b = numOr(preset.rewardCategories[k], 0.0)
            if (a != b) {
                val aLabel = if (a == 0.0) "—" else "$a"
                val bLabel = if (b == 0.0) "—" else "$b"
                lines.add("$k: $aLabel% → $bLabel%")
            }
        }
        val ptsA = numOr(card.pointValue, 1.0)
        val ptsB = numOr(preset.pointValue, 1.0)
        if (ptsA != ptsB) lines.add("Point value: ${ptsA}¢ → ${ptsB}¢")
        val shown = lines.take(8)
        return shown.joinToString("\n") + if (lines.size > 8) "\n…" else ""
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

    private fun trimRate(n: Double): String =
        if (n == Math.floor(n)) n.toInt().toString() else (Math.round(n * 100) / 100.0).toString()

    /**
     * A short "why this card" line for a category: category bonus vs. flat
     * base, and (for points cards) multiplier × point-value cash return.
     */
    fun explanation(card: Card, category: String): String {
        val rate = effectiveRate(card, category)
        if (rate <= 0) return "No reward rate set"
        val override = card.rewardCategories[category] ?: 0.0
        val isBonus = override > 0 && override != card.rewardBase
        val where = if (isBonus) "on ${category.lowercase()}" else "on everything"
        val pv = pointValue(card)
        return if (pv != 1.0) {
            "${trimRate(rate)}× points · ${trimRate(pv)}¢/pt = ${trimRate(rate * pv)}% back $where"
        } else {
            "${trimRate(rate)}% back $where"
        }
    }

    data class WalletPick(val category: String, val best: Ranked?)

    /** One entry per category — the single best eligible card (null when none
     *  earn there). The whole-wallet "best card for each" view. */
    fun walletStrategy(cards: List<Card>, categories: List<String>, zone: ZoneId): List<WalletPick> =
        categories.map { cat ->
            val top = rank(cards, cat, zone).eligible.firstOrNull()
            WalletPick(cat, if ((top?.value ?: 0.0) > 0) top else null)
        }

    // ── Spend-based rewards estimate (feeds the annual-fee verdict) ──────

    /** Which reward category a transaction counts toward: a merchant-name hint
     *  first, then the transaction's own category if it's a reward category,
     *  else "Other". */
    fun txRewardCategory(t: SpendTransaction): String {
        Merchants.category(t.merchant)?.let { return it }
        if (CATEGORIES.contains(t.category)) return t.category
        return "Other"
    }

    /**
     * Annualized spend per reward category from the user's transactions over the
     * trailing year. Annualizes by the span of data present (clamped so a few
     * days can't extrapolate to a wild yearly figure). Empty when there's
     * nothing to go on. Only positive-amount outflows count.
     */
    fun categorySpendAnnual(transactions: List<SpendTransaction>, today: LocalDate): Map<String, Double> {
        val yearAgo = today.minusDays(365)
        data class Row(val amt: Double, val date: LocalDate, val tx: SpendTransaction)
        val recent = mutableListOf<Row>()
        for (t in transactions) {
            if (t.amount <= 0) continue
            val d = DateLogic.parseDate(t.date) ?: continue
            if (d.isBefore(yearAgo) || d.isAfter(today)) continue
            recent.add(Row(t.amount, d, t))
        }
        if (recent.isEmpty()) return emptyMap()
        val minDate = recent.minOf { it.date }
        val rawSpan = ChronoUnit.DAYS.between(minDate, today).toInt()
        val spanDays = max(30, rawSpan).toDouble()
        val factor = 365.0 / spanDays
        val totals = mutableMapOf<String, Double>()
        for (r in recent) {
            val cat = txRewardCategory(r.tx)
            totals[cat] = (totals[cat] ?: 0.0) + r.amt
        }
        return totals.mapValues { (it.value * factor).roundToLong().toDouble() }
    }

    /**
     * Estimated annual rewards a card earns, given annualized category spend.
     * Only the card's BONUS categories count (rate beats base) — the spend you'd
     * realistically route here — so the estimate stays honest. Loans earn
     * nothing. Result is a cash figure (cents-per-point folded in).
     */
    fun cardRewardsEstimateAnnual(card: Card, spendByCategory: Map<String, Double>): Double {
        if (card.type == "loan") return 0.0
        val base = card.rewardBase
        var total = 0.0
        for ((cat, spend) in spendByCategory) {
            if (spend <= 0) continue
            val override = card.rewardCategories[cat] ?: 0.0
            if (override > 0 && override > base) {
                total += (spend * effectiveValue(card, cat)) / 100  // effectiveValue is a % return
            }
        }
        return total.roundToLong().toDouble()
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
