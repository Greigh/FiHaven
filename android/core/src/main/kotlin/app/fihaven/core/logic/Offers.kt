package app.fihaven.core.logic

import app.fihaven.core.model.Card
import app.fihaven.core.model.CardOffer
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Card-linked offers tracker — pure helpers mirroring the web `offers.js`
 * (and iOS `Offers.swift`). FiHaven can't auto-activate offers (issuer APIs
 * are private); this keeps the expiry of offers you've activated in front of
 * you. Offers live on `Card.offers`.
 */
object Offers {
    private fun parse(s: String): LocalDate? = DateLogic.parseDate(s)

    /** Whole days until an offer expires (negative once past); null with no date. */
    fun daysLeft(offer: CardOffer, today: LocalDate): Int? {
        val end = parse(offer.expires) ?: return null
        return ChronoUnit.DAYS.between(today, end).toInt()
    }

    fun expired(offer: CardOffer, today: LocalDate): Boolean {
        val d = daysLeft(offer, today) ?: return false
        return d < 0
    }

    data class ActiveOffer(val card: Card, val offer: CardOffer, val daysLeft: Int?)

    /** Every still-actionable offer across all cards, soonest expiry first
     *  (no-expiry offers sort last). */
    fun active(cards: List<Card>, today: LocalDate): List<ActiveOffer> {
        val out = mutableListOf<ActiveOffer>()
        for (c in cards) {
            for (o in c.offers) {
                if (o.used) continue
                val d = daysLeft(o, today)
                if (d != null && d < 0) continue
                out.add(ActiveOffer(c, o, d))
            }
        }
        return out.sortedWith(compareBy(nullsLast()) { it.daysLeft })
    }

    /** How many active offers expire within [withinDays] (default a week). */
    fun expiringSoon(cards: List<Card>, today: LocalDate, withinDays: Int = 7): Int =
        active(cards, today).count { it.daysLeft != null && it.daysLeft <= withinDays }

    // ── Plaid-assisted "looks like you used this" detection ─────────────

    /** Normalize a merchant string for fuzzy matching: lowercase, alphanumerics
     *  only ("Amex Travel #123" → "amextravel123"). */
    private fun normMerchant(s: String): String =
        s.lowercase().filter { it.isLetterOrDigit() }

    /**
     * The most recent transaction that looks like it satisfies [offer], or null.
     * A positive-amount charge whose merchant contains (or is contained by) the
     * offer's merchant, dated within the last [windowDays] (default 60) and not
     * in the future. Skips used offers. A SUGGESTION only — the user confirms.
     */
    fun likelyUsedTx(
        offer: CardOffer, transactions: List<SpendTransaction>, today: LocalDate, windowDays: Long = 60,
    ): SpendTransaction? {
        if (offer.used) return null
        val m = normMerchant(offer.merchant)
        if (m.length < 3) return null
        val start = today.minusDays(windowDays)
        var best: SpendTransaction? = null
        var bestDate: LocalDate? = null
        for (t in transactions) {
            if (t.amount <= 0) continue
            val tm = normMerchant(t.merchant)
            if (tm.length < 3 || (!tm.contains(m) && !m.contains(tm))) continue
            val td = parse(t.date) ?: continue
            if (td.isBefore(start) || td.isAfter(today)) continue
            if (bestDate == null || td.isAfter(bestDate)) { best = t; bestDate = td }
        }
        return best
    }

    data class UseSuggestion(val card: Card, val offer: CardOffer, val tx: SpendTransaction)

    /** For every active (unused, unexpired) offer, any matching transaction that
     *  suggests it was used. Drives the "looks like you used this offer" prompt. */
    fun useSuggestions(cards: List<Card>, transactions: List<SpendTransaction>, today: LocalDate): List<UseSuggestion> {
        val out = mutableListOf<UseSuggestion>()
        for (c in cards) {
            for (o in c.offers) {
                if (o.used || expired(o, today)) continue
                likelyUsedTx(o, transactions, today)?.let { out.add(UseSuggestion(c, o, it)) }
            }
        }
        return out
    }
}
