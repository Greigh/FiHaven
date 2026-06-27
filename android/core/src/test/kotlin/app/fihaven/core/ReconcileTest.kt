package app.fihaven.core

import app.fihaven.core.logic.Reconcile
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ReconcileTest {
    private val today = LocalDate.of(2026, 6, 20)
    private fun tx(id: String, date: String, amount: Double, merchant: String, source: String = "manual") =
        SpendTransaction(id = id, date = date, amount = amount, merchant = merchant, source = source)

    @Test fun looksSame() {
        assertTrue(Reconcile.looksSame(
            tx("a", "2026-06-15", 42.5, "Starbucks #12"),
            tx("b", "2026-06-16", 42.5, "STARBUCKS", "plaid")))
        assertFalse(Reconcile.looksSame(
            tx("a", "2026-06-15", 42.5, "Starbucks"),
            tx("b", "2026-06-20", 42.5, "Starbucks", "plaid"))) // far date
        assertFalse(Reconcile.looksSame(
            tx("a", "2026-06-15", 42.5, "Starbucks"),
            tx("b", "2026-06-15", 9.0, "Starbucks", "plaid")))  // amount
        assertTrue(Reconcile.looksSame(
            tx("a", "2026-06-15", 10.0, "Target"),
            tx("b", "2026-06-18", 10.0, "Target", "plaid"), dayTolerance = 3)) // custom tol
    }

    @Test fun duplicatesAndUnmatched() {
        val txns = listOf(
            tx("m1", "2026-06-15", 42.5, "Starbucks"),
            tx("m2", "2026-06-10", 80.0, "Costco"),
            tx("p1", "2026-06-16", 42.5, "STARBUCKS #9", "plaid"),
            tx("p2", "2026-06-14", 23.1, "Shell Oil", "plaid"),
        )
        val pairs = Reconcile.duplicatePairs(txns)
        assertEquals(1, pairs.size)
        assertEquals("m1", pairs[0].manual.id)
        assertEquals("p1", pairs[0].bank.id)
        assertEquals(listOf("p2"), Reconcile.unmatchedBank(txns).map { it.id })
    }

    @Test fun unconfirmedManual() {
        val txns = listOf(
            tx("m1", "2026-06-15", 42.5, "Starbucks"),  // matched by bank
            tx("m2", "2026-06-18", 80.0, "Costco"),     // recent, unmatched → flagged
            tx("m3", "2026-01-01", 9.0, "Old"),         // too old
            tx("p1", "2026-06-16", 42.5, "STARBUCKS", "plaid"),
        )
        assertEquals(listOf("m2"), Reconcile.unconfirmedManual(txns, today).map { it.id })
    }
}
