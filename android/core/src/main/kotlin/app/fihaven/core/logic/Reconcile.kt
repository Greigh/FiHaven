package app.fihaven.core.logic

import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/**
 * Bank-vs-manual transaction reconciliation. FiHaven is manual-first; a linked
 * bank (Plaid) adds transactions tagged source="plaid" ALONGSIDE the manual
 * ones, never replacing them — so the same purchase can appear twice. This
 * finds those overlaps to audit, plus bank rows with no manual match. Matching
 * is conservative: same amount (to the cent), a similar merchant, and a date
 * within ±1 day. A suggestion only. Mirrors the web `reconcile.js` (and iOS
 * `Reconcile.swift`).
 */
object Reconcile {
    private fun normMerchant(s: String): String = s.lowercase().filter { it.isLetterOrDigit() }

    /** Do two transactions look like the SAME purchase? */
    fun looksSame(a: SpendTransaction, b: SpendTransaction, dayTolerance: Int = 1): Boolean {
        if (abs(a.amount - b.amount) > 0.01) return false
        val am = normMerchant(a.merchant)
        val bm = normMerchant(b.merchant)
        if (am.length < 3 || bm.length < 3) return false
        if (!am.contains(bm) && !bm.contains(am)) return false
        val da = DateLogic.parseDate(a.date) ?: return false
        val db = DateLogic.parseDate(b.date) ?: return false
        return abs(ChronoUnit.DAYS.between(da, db)).toInt() <= dayTolerance
    }

    data class DuplicatePair(val manual: SpendTransaction, val bank: SpendTransaction)

    /** Pairs where a bank transaction duplicates a manual one (each row paired
     *  at most once, newest bank first) — the audit queue. */
    fun duplicatePairs(transactions: List<SpendTransaction>, dayTolerance: Int = 1): List<DuplicatePair> {
        val manual = transactions.filter { it.source != "plaid" }
        val bank = transactions.filter { it.source == "plaid" }.sortedByDescending { it.date }
        val usedManual = mutableSetOf<String>()
        val pairs = mutableListOf<DuplicatePair>()
        for (b in bank) {
            val m = manual.firstOrNull { !usedManual.contains(it.id) && looksSame(it, b, dayTolerance) }
            if (m != null) { usedManual.add(m.id); pairs.add(DuplicatePair(m, b)) }
        }
        return pairs
    }

    /** Bank transactions with no manual counterpart, newest first. */
    fun unmatchedBank(transactions: List<SpendTransaction>, dayTolerance: Int = 1): List<SpendTransaction> {
        val dupIds = duplicatePairs(transactions, dayTolerance).map { it.bank.id }.toSet()
        return transactions.filter { it.source == "plaid" && it.id !in dupIds }.sortedByDescending { it.date }
    }

    /** Recent manual transactions (within [staleDays], default 35) the bank
     *  never corroborated — ones it "seems to be missing". Newest first. */
    fun unconfirmedManual(transactions: List<SpendTransaction>, today: LocalDate, staleDays: Long = 35): List<SpendTransaction> {
        val cutoff = today.minusDays(staleDays)
        val bank = transactions.filter { it.source == "plaid" }
        return transactions.filter { t ->
            if (t.source == "plaid") return@filter false
            val d = DateLogic.parseDate(t.date) ?: return@filter false
            if (d.isBefore(cutoff) || d.isAfter(today)) return@filter false
            bank.none { looksSame(t, it) }
        }.sortedByDescending { it.date }
    }
}
