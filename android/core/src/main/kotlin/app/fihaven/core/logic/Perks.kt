package app.fihaven.core.logic

import app.fihaven.core.model.Card
import app.fihaven.core.model.CardPerk
import java.time.LocalDate

/**
 * Card credits & perks — recurring statement credits the user logs usage
 * against each cycle. Pure helpers mirroring the web `perks.js` (and iOS
 * `Perks.swift`). Usage is stored per (card, perk, cycle) in
 * settings.perkUsage; what's left is money on the table.
 */
object Perks {
    val FREQUENCIES = listOf("monthly", "quarterly", "semiannual", "annual")

    /** "YYYY-MM" / "YYYY-Qn" / "YYYY-Hn" / "YYYY" for the cycle a date is in. */
    fun cycleKey(frequency: String, date: LocalDate): String {
        val y = date.year
        val m0 = date.monthValue - 1
        return when (frequency) {
            "quarterly" -> "$y-Q${m0 / 3 + 1}"
            "semiannual" -> "$y-H${m0 / 6 + 1}"
            "annual" -> "$y"
            else -> "%04d-%02d".format(y, m0 + 1)
        }
    }

    /** [start, end) bounds of the cycle a date falls in. */
    fun cycleBounds(frequency: String, date: LocalDate): Pair<LocalDate, LocalDate> {
        val y = date.year
        val m0 = date.monthValue - 1
        fun day1(month0: Int) = LocalDate.of(y, 1, 1).plusMonths(month0.toLong())
        return when (frequency) {
            "quarterly" -> { val q = (m0 / 3) * 3; day1(q) to day1(q + 3) }
            "semiannual" -> { val h = (m0 / 6) * 6; day1(h) to day1(h + 6) }
            "annual" -> LocalDate.of(y, 1, 1) to LocalDate.of(y + 1, 1, 1)
            else -> day1(m0) to day1(m0 + 1)
        }
    }

    /** Whole days left in the current cycle (0 on the last day). */
    fun expiresInDays(frequency: String, date: LocalDate): Int {
        val end = cycleBounds(frequency, date).second
        return maxOf(0, (java.time.temporal.ChronoUnit.DAYS.between(date, end) - 1).toInt())
    }

    fun usageKey(cardId: String, perkId: String, frequency: String, date: LocalDate): String =
        "$cardId:$perkId:${cycleKey(frequency, date)}"

    fun used(usage: Map<String, Double>, cardId: String, perk: CardPerk, date: LocalDate): Double =
        usage[usageKey(cardId, perk.id, perk.frequency, date)] ?: 0.0

    fun remaining(usage: Map<String, Double>, cardId: String, perk: CardPerk, date: LocalDate): Double =
        maxOf(0.0, perk.amount - minOf(used(usage, cardId, perk, date), perk.amount))

    /** Dollars unused across every perk on every card. */
    fun unrealizedTotal(cards: List<Card>, usage: Map<String, Double>, date: LocalDate): Double =
        cards.sumOf { c -> c.perks.sumOf { remaining(usage, c.id.toString(), it, date) } }

    /** How many times a perk's cycle recurs in a year. */
    fun cyclesPerYear(frequency: String): Int =
        mapOf("monthly" to 12, "quarterly" to 4, "semiannual" to 2, "annual" to 1)[frequency] ?: 1

    /** Annual cash value of a card's perks if every credit is fully used. */
    fun annualValue(card: Card): Double =
        card.perks.sumOf { it.amount * cyclesPerYear(it.frequency) }

    /** Annualized value of credits actually captured (this cycle's usage as
     *  typical, capped at each perk's value). */
    fun capturedAnnual(card: Card, usage: Map<String, Double>, date: LocalDate): Double =
        card.perks.sumOf { p ->
            minOf(used(usage, card.id.toString(), p, date), p.amount) * cyclesPerYear(p.frequency)
        }

    enum class FeeVerdict { KEEP, OPTIMIZE, REVIEW }
    data class FeeAssessment(
        val fee: Double, val potential: Double, val captured: Double,
        val rewards: Double, val value: Double, val net: Double, val verdict: FeeVerdict,
    )

    /**
     * "Is this annual fee worth it?" — fee vs. the value the card returns: its
     * perks (potential + captured) plus an optional estimate of rewards earned
     * from spend ([rewardsEstimate], from Rewards.cardRewardsEstimateAnnual).
     * null for fee-free cards. With no estimate (0) the verdict is framed on
     * perks alone, the concrete data we always have.
     */
    fun feeAssessment(
        card: Card, usage: Map<String, Double>, date: LocalDate, rewardsEstimate: Double = 0.0,
    ): FeeAssessment? {
        val fee = card.annualFee ?: 0.0
        if (fee <= 0) return null
        val potential = annualValue(card)
        val captured = capturedAnnual(card, usage, date)
        val rewards = maxOf(0.0, rewardsEstimate)
        val value = captured + rewards
        val verdict = when {
            value >= fee -> FeeVerdict.KEEP
            potential + rewards >= fee -> FeeVerdict.OPTIMIZE
            else -> FeeVerdict.REVIEW
        }
        return FeeAssessment(fee, potential, captured, rewards, value, value - fee, verdict)
    }

    /**
     * Apply a usage edit (clamped to [0, perk amount]) and prune entries from
     * cycles two+ years old. Returns the new map to store in settings.
     */
    fun applyUsage(
        usage: Map<String, Double>, cardId: String, perk: CardPerk, amount: Double, date: LocalDate,
    ): Map<String, Double> {
        val map = usage.toMutableMap()
        val clamped = maxOf(0.0, minOf(amount, perk.amount))
        val key = usageKey(cardId, perk.id, perk.frequency, date)
        if (clamped > 0) map[key] = clamped else map.remove(key)

        val minYear = date.year - 1
        map.keys.toList().forEach { k ->
            val y = k.substringAfterLast(':').take(4).toIntOrNull()
            if (y != null && y < minYear) map.remove(k)
        }
        return map
    }
}
