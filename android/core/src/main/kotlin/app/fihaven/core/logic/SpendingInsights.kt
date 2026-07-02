package app.fihaven.core.logic

import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate

/// Period-over-period category deltas (Pro) — port of spendingInsights.js.
object SpendingInsights {
    private val defaultCats = listOf(
        "Groceries", "Dining", "Shopping", "Transport", "Entertainment", "Health", "Bills", "Other",
    )

    data class Row(
        val cat: String,
        val now: Double,
        val was: Double,
        val delta: Double,
        val pct: Int,
    )

    fun spentByCategory(transactions: List<SpendTransaction>, bounds: PeriodBounds): Map<String, Double> {
        val m = mutableMapOf<String, Double>()
        transactions.forEach { t ->
            if (!transactionInPeriod(t.date, bounds)) return@forEach
            val cat = t.category.ifBlank { "Other" }
            m[cat] = (m[cat] ?: 0.0) + t.amount
        }
        return m
    }

    /** Compare current vs previous period spending by category (largest swings first). */
    fun compute(
        transactions: List<SpendTransaction>,
        currentBounds: PeriodBounds,
        prevBounds: PeriodBounds,
    ): List<Row> {
        val cur = spentByCategory(transactions, currentBounds)
        val prev = spentByCategory(transactions, prevBounds)
        val cats = (defaultCats + cur.keys + prev.keys).toSet()
        return cats.mapNotNull { cat ->
            val now = cur[cat] ?: 0.0
            val was = prev[cat] ?: 0.0
            if (now <= 0 && was <= 0) return@mapNotNull null
            val delta = now - was
            val pct = when {
                was > 0 -> kotlin.math.round(delta / was * 100).toInt()
                now > 0 -> 100
                else -> 0
            }
            Row(cat, now, was, delta, pct)
        }.sortedByDescending { kotlin.math.abs(it.delta) }
    }

    private fun transactionInPeriod(date: String, bounds: PeriodBounds): Boolean {
        if (date.isBlank()) return false
        val d = runCatching { LocalDate.parse(date) }.getOrNull() ?: return false
        return !d.isBefore(bounds.start) && d.isBefore(bounds.end)
    }
}
