package app.fihaven.core

import app.fihaven.core.logic.Period
import app.fihaven.core.logic.PeriodConfig
import app.fihaven.core.logic.SpendingInsights
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Mirrors client/js/spendingInsights.test.js. */
class SpendingInsightsTest {
    private val calendar = PeriodConfig.normalized("calendar", null, null)
    private val june = Period.bounds(LocalDate.of(2026, 6, 15), calendar)
    private val may = Period.bounds(LocalDate.of(2026, 5, 15), calendar)

    private fun tx(amount: Double, category: String, date: String) =
        SpendTransaction(id = "t-$date-$category-$amount", amount = amount, category = category, date = date)

    @Test fun spentByCategorySumsWithinThePeriodOnly() {
        val spend = SpendingInsights.spentByCategory(
            listOf(
                tx(20.0, "Groceries", "2026-06-01"),   // first day is inside
                tx(30.0, "Groceries", "2026-06-30"),   // last day is inside
                tx(10.0, "Dining", "2026-06-15"),
                tx(99.0, "Dining", "2026-07-01"),      // the end is exclusive
                tx(99.0, "Dining", "2026-05-31"),      // before the start
            ),
            june,
        )
        assertEquals(50.0, spend["Groceries"]!!, 1e-9)
        assertEquals(10.0, spend["Dining"]!!, 1e-9)
    }

    @Test fun spentByCategoryBucketsBlankCategoriesAndIgnoresUnusableDates() {
        val spend = SpendingInsights.spentByCategory(
            listOf(
                tx(5.0, "", "2026-06-02"),
                tx(7.0, "Other", "2026-06-03"),
                tx(99.0, "Groceries", ""),             // never entered
                tx(99.0, "Groceries", "not-a-date"),
            ),
            june,
        )
        assertEquals(12.0, spend["Other"]!!, 1e-9)     // blank folds into Other
        assertNull(spend["Groceries"])                 // unusable dates are dropped
    }

    @Test fun computeReportsDeltasAgainstThePreviousPeriod() {
        val rows = SpendingInsights.compute(
            listOf(
                tx(150.0, "Groceries", "2026-06-10"),
                tx(100.0, "Groceries", "2026-05-10"),
                tx(20.0, "Dining", "2026-06-11"),
                tx(80.0, "Dining", "2026-05-11"),
            ),
            june, may,
        )
        val byCat = rows.associateBy { it.cat }

        val groceries = byCat.getValue("Groceries")
        assertEquals(150.0, groceries.now, 1e-9)
        assertEquals(100.0, groceries.was, 1e-9)
        assertEquals(50.0, groceries.delta, 1e-9)
        assertEquals(50, groceries.pct)

        val dining = byCat.getValue("Dining")
        assertEquals(-60.0, dining.delta, 1e-9)
        assertEquals(-75, dining.pct)
    }

    @Test fun computeHandlesCategoriesThatStartedOrStopped() {
        val rows = SpendingInsights.compute(
            listOf(
                tx(40.0, "Health", "2026-06-12"),      // new this period
                tx(90.0, "Transport", "2026-05-12"),   // stopped this period
            ),
            june, may,
        ).associateBy { it.cat }

        // No previous spending to compare against reads as a full 100% rise.
        assertEquals(100, rows.getValue("Health").pct)
        assertEquals(40.0, rows.getValue("Health").delta, 1e-9)

        // A category you stopped spending in still reports, as a fall to zero.
        assertEquals(0.0, rows.getValue("Transport").now, 1e-9)
        assertEquals(-90.0, rows.getValue("Transport").delta, 1e-9)
        assertEquals(-100, rows.getValue("Transport").pct)
    }

    @Test fun computeOmitsCategoriesWithNoSpendingEitherWay() {
        val rows = SpendingInsights.compute(listOf(tx(10.0, "Dining", "2026-06-10")), june, may)
        // Every default category exists, but only the one with activity shows.
        assertEquals(listOf("Dining"), rows.map { it.cat })
        assertTrue(SpendingInsights.compute(emptyList(), june, may).isEmpty())
    }

    // Moved here from LogicTest.kt when this file was split out, so all the
    // SpendingInsights cases live together. Exercises Period.shift as the
    // source of the previous bounds, which the others do not.
    @Test fun computeSortsByDelta() {
        val cfg = PeriodConfig.normalized("calendar", null, 35)
        val cur = Period.bounds(LocalDate.of(2026, 6, 1), cfg)
        val prev = Period.shift(cur, -1, cfg)
        val rows = SpendingInsights.compute(
            listOf(
                tx(200.0, "Dining", "2026-06-05"),
                tx(50.0, "Dining", "2026-05-05"),
                tx(80.0, "Groceries", "2026-06-03"),
            ),
            cur, prev,
        )
        assertEquals("Dining", rows.first().cat)
        assertEquals(150.0, rows.first().delta, 1e-6)
    }

    @Test fun computeLeadsWithTheBiggestSwingRegardlessOfDirection() {
        val rows = SpendingInsights.compute(
            listOf(
                tx(30.0, "Dining", "2026-06-10"),      // +30
                tx(10.0, "Groceries", "2026-06-10"),   // +10
                tx(200.0, "Shopping", "2026-05-10"),   // −200, the biggest move
            ),
            june, may,
        )
        assertEquals(listOf("Shopping", "Dining", "Groceries"), rows.map { it.cat })
    }
}
