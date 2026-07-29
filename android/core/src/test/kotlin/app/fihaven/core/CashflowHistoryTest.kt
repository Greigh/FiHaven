package app.fihaven.core

import app.fihaven.core.logic.CashflowHistory
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.Payment
import app.fihaven.core.model.SpendTransaction
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Mirrors client/js/cashflowHistory.test.js — same cases, same expectations.
class CashflowHistoryTest {
    private fun tx(id: String, date: String, amount: Double, merchant: String = "") =
        SpendTransaction(id = id, date = date, amount = amount, merchant = merchant)

    private fun pay(
        id: String, type: String, name: String, amount: Double, date: String, skipped: Boolean = false,
    ) = Payment(
        id = id, type = type, refId = "R1", name = name, amount = amount,
        date = date, monthKey = date.take(7), skipped = skipped,
    )

    private val settings = FiHavenJson.parseToJsonElement("""{"income":5000}""").jsonObject

    @Test fun bucketsByDateThenMonthKey() {
        assertEquals("2026-06", CashflowHistory.monthKey("2026-06-15"))
        assertEquals("2026-04", CashflowHistory.monthKey("", "2026-04"))
        assertEquals("", CashflowHistory.monthKey("", ""))
        // A non-calendar period key still slices to its calendar month.
        assertEquals("2026-06", CashflowHistory.monthKey("", "2026-06-25"))
    }

    @Test fun cardPaymentsAreTransfersNotSpending() {
        val payments = listOf(
            pay("c1", "card", "Chase Sapphire", 800.0, "2026-06-05"),
            pay("b1", "bill", "Rent", 1500.0, "2026-06-01"),
        )
        val txs = listOf(tx("t1", "2026-06-10", 120.0, "Costco"), tx("t2", "2026-06-12", 45.0, "Shell"))

        val m = CashflowHistory.monthlySpending(payments, txs)["2026-06"]!!
        assertEquals(1665.0, m.spending, 1e-6)          // 1500 rent + 165 purchases
        assertEquals(800.0, m.cardPaymentsExcluded, 1e-6)
        assertTrue(!m.blind)
    }

    @Test fun cardPaymentsWithNoTransactionsAreBlind() {
        val payments = listOf(
            pay("c1", "card", "Chase Sapphire", 800.0, "2026-06-05"),
            pay("b1", "bill", "Rent", 1500.0, "2026-06-01"),
        )
        val m = CashflowHistory.monthlySpending(payments, emptyList())["2026-06"]!!
        assertEquals(1500.0, m.spending, 1e-6)          // the bill still counts
        assertEquals(800.0, m.cardPaymentsExcluded, 1e-6)
        assertTrue(m.blind)
    }

    @Test fun skippedPaymentsAreNotOutflows() {
        val skips = listOf(pay("s1", "bill", "Rent", 0.0, "2026-06-01", skipped = true))
        assertNull(CashflowHistory.monthlySpending(skips, emptyList())["2026-06"])
    }

    @Test fun dropsABillAlreadyLoggedAsATransaction() {
        val bill = listOf(pay("b1", "bill", "Verizon", 90.0, "2026-06-03"))
        val txs = listOf(tx("t1", "2026-06-03", 90.0, "Verizon"))
        assertEquals(1, CashflowHistory.duplicateBillPayments(bill, txs).size)
        // Counted once, from the transaction side.
        assertEquals(90.0, CashflowHistory.monthlySpending(bill, txs)["2026-06"]!!.spending, 1e-6)
    }

    @Test fun keepsBothWhenTheTransactionHasNoMerchant() {
        val bill = listOf(pay("b1", "bill", "Verizon", 90.0, "2026-06-03"))
        val txs = listOf(tx("t1", "2026-06-03", 90.0, ""))
        assertEquals(0, CashflowHistory.duplicateBillPayments(bill, txs).size)
        assertEquals(180.0, CashflowHistory.monthlySpending(bill, txs)["2026-06"]!!.spending, 1e-6)
    }

    @Test fun eachTransactionAbsorbsAtMostOneBill() {
        val bills = listOf(
            pay("b1", "bill", "Verizon", 90.0, "2026-06-03"),
            pay("b2", "bill", "Verizon", 90.0, "2026-06-03"),
        )
        val txs = listOf(tx("t1", "2026-06-03", 90.0, "Verizon"))
        assertEquals(1, CashflowHistory.duplicateBillPayments(bills, txs).size)
        // 90 tx + 90 surviving bill.
        assertEquals(180.0, CashflowHistory.monthlySpending(bills, txs)["2026-06"]!!.spending, 1e-6)
    }

    @Test fun monthKeysThroughIsChronological() {
        assertEquals(listOf("2026-04", "2026-05", "2026-06"), CashflowHistory.monthKeysThrough(3, "2026-06"))
        assertEquals(listOf("2025-11", "2025-12", "2026-01"), CashflowHistory.monthKeysThrough(3, "2026-01"))
    }

    @Test fun clampsWindowToFirstRecordedMonth() {
        val payments = listOf(pay("b1", "bill", "Rent", 1500.0, "2026-05-01"))
        val txs = listOf(tx("t1", "2026-06-10", 200.0, "Costco"))
        val s = CashflowHistory.series(settings, payments, txs, months = 18, from = "2026-06")
        assertEquals("2026-05", s.firstRecorded)
        assertEquals(listOf("2026-05", "2026-06"), s.rows.map { it.mk })
    }

    @Test fun netIsIncomeMinusMergedSpending() {
        val payments = listOf(pay("b1", "bill", "Rent", 1500.0, "2026-06-01"))
        val txs = listOf(tx("t1", "2026-06-10", 200.0, "Costco"))
        val june = CashflowHistory.series(settings, payments, txs, months = 6, from = "2026-06")
            .rows.first { it.mk == "2026-06" }
        assertEquals(5000.0, june.income, 1e-6)
        assertEquals(1700.0, june.spending, 1e-6)
        assertEquals(3300.0, june.net, 1e-6)
    }

    @Test fun oneOffAdjustmentAppliesToItsMonthOnly() {
        val withBonus = FiHavenJson.parseToJsonElement(
            """{"income":5000,"incomeAdjustments":[{"id":"a1","kind":"once","monthKey":"2026-06","amount":1000}]}"""
        ).jsonObject
        val payments = listOf(pay("b1", "bill", "Rent", 1500.0, "2026-05-01"))
        val rows = CashflowHistory.series(withBonus, payments, emptyList(), months = 6, from = "2026-06").rows
        assertEquals(5000.0, rows.first { it.mk == "2026-05" }.income, 1e-6)
        assertEquals(6000.0, rows.first { it.mk == "2026-06" }.income, 1e-6)
    }

    @Test fun unrecordedInWindowMonthIsBlindNotZero() {
        val payments = listOf(
            pay("b1", "bill", "Rent", 1500.0, "2026-04-01"),
            pay("b2", "bill", "Rent", 1500.0, "2026-06-01"),
        )
        val s = CashflowHistory.series(settings, payments, emptyList(), months = 6, from = "2026-06")
        assertEquals(listOf("2026-04", "2026-05", "2026-06"), s.rows.map { it.mk })
        assertTrue(s.rows.first { it.mk == "2026-05" }.blind)
        assertEquals(1, s.blindMonths)
    }

    @Test fun emptyWhenNothingRecorded() {
        val s = CashflowHistory.series(settings, emptyList(), emptyList(), months = 18, from = "2026-06")
        assertTrue(s.rows.isEmpty())
        assertEquals("", s.firstRecorded)
    }

    @Test fun incomeIsAlwaysReportedAsProjected() {
        val payments = listOf(pay("b1", "bill", "Rent", 1500.0, "2026-06-01"))
        assertTrue(CashflowHistory.series(settings, payments, emptyList(), months = 6, from = "2026-06").incomeProjected)
    }
}
