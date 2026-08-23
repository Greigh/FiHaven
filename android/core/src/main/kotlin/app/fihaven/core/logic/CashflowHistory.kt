package app.fihaven.core.logic

import app.fihaven.core.model.Payment
import app.fihaven.core.model.SpendTransaction
import kotlinx.serialization.json.JsonObject

/**
 * Monthly income vs. spending, merged from both outflow stores with
 * card-payment deduplication.
 *
 * FiHaven records money leaving your pocket in TWO places: `transactions`
 * (purchases, typed or bank-imported) and `payments` (bills and card payments
 * marked paid). Naively summing them double-counts. A CARD payment is a
 * transfer between your own accounts, not an expenditure: the purchases it
 * settles were already recorded as transactions on that card. So card payments
 * never count as spending — each month instead reports how much was held out
 * ([MonthSpending.cardPaymentsExcluded]) and whether any transaction coverage
 * exists. A month with card payments and no transactions is BLIND, and callers
 * are expected to say so rather than render a misleadingly low figure.
 *
 * BILL payments ARE real outflows and are counted, minus any that duplicate a
 * logged transaction (rent typed into Spending AND marked paid on Bills). That
 * match reuses [Reconcile.looksSame]'s deliberately conservative rule.
 *
 * Income is NOT a recorded history: [Income.monthlyIncome] projects today's
 * configured income backwards over every month, varying only by adjustments.
 * [Series.incomeProjected] exists so the UI can caption that honestly instead
 * of implying it measured anything.
 *
 * Mirrors the web `cashflowHistory.js` (and iOS `CashflowHistory.swift`) —
 * change all three together.
 */
object CashflowHistory {

    /** Per-month outflow. [spending] is the figure to plot; the rest is
     *  provenance so the UI can explain it and flag where it can't be trusted. */
    data class MonthSpending(
        val spending: Double = 0.0,
        val fromTransactions: Double = 0.0,
        val fromBills: Double = 0.0,
        val cardPaymentsExcluded: Double = 0.0,
        val txCount: Int = 0,
        val blind: Boolean = false,
    )

    data class Row(
        val mk: String,
        val income: Double,
        val spending: Double,
        val net: Double,
        val fromTransactions: Double,
        val fromBills: Double,
        val cardPaymentsExcluded: Double,
        val blind: Boolean,
    )

    data class Series(
        val rows: List<Row>,
        val blindMonths: Int,
        /** Always true today — income derives from current settings, not stored
         *  per month. Flip when income gains real per-month history. */
        val incomeProjected: Boolean,
        val firstRecorded: String,
    )

    data class BillDuplicate(val payment: Payment, val transaction: SpendTransaction)

    /** The "YYYY-MM" calendar bucket a dated record falls in. Falls back to a
     *  stored monthKey for date-less rows; a non-calendar period key
     *  ("YYYY-MM-DD") still slices down to the right calendar month. */
    fun monthKey(date: String, monthKey: String = ""): String = when {
        date.length >= 7 -> date.take(7)
        monthKey.length >= 7 -> monthKey.take(7)
        else -> ""
    }

    /** A payment reshaped for [Reconcile.looksSame], which speaks transactions.
     *  A payment's `name` ("Rent") plays the merchant role. */
    private fun matchable(p: Payment) =
        SpendTransaction(id = p.id, date = p.date, amount = p.amount, merchant = p.name)

    /** Real (non-skipped) payments of one type. Skips are stored as payments
     *  with amount 0 and `skipped` set — they are not outflows. */
    private fun paymentsOfType(payments: List<Payment>, type: String): List<Payment> =
        payments.filter { !it.skipped && it.type == type }

    /**
     * Bill payments that duplicate an already-logged transaction. Each
     * transaction backs at most one payment. Conservative by construction:
     * [Reconcile.looksSame] requires a real name on BOTH sides (≥3 chars
     * normalized) and a date within ±1 day, so an unnamed transaction never
     * silently absorbs a bill.
     */
    fun duplicateBillPayments(
        payments: List<Payment>,
        transactions: List<SpendTransaction>,
        dayTolerance: Int = 1,
    ): List<BillDuplicate> {
        val used = mutableSetOf<String>()
        val dups = mutableListOf<BillDuplicate>()
        for (p in paymentsOfType(payments, "bill")) {
            val probe = matchable(p)
            val m = transactions.firstOrNull {
                it.id !in used && Reconcile.looksSame(probe, it, dayTolerance)
            }
            if (m != null) { used.add(m.id); dups.add(BillDuplicate(p, m)) }
        }
        return dups
    }

    /** Per-calendar-month outflow, keyed "YYYY-MM". */
    fun monthlySpending(
        payments: List<Payment>,
        transactions: List<SpendTransaction>,
        dayTolerance: Int = 1,
    ): Map<String, MonthSpending> {
        val out = mutableMapOf<String, MonthSpending>()

        for (t in transactions) {
            // A card payment is a transfer, not an outflow to plot — the
            // purchases it settles are already here under their own months.
            if (!t.countsAsSpending) continue
            val mk = monthKey(t.date)
            if (mk.isEmpty()) continue
            val b = out[mk] ?: MonthSpending()
            out[mk] = b.copy(fromTransactions = b.fromTransactions + t.amount, txCount = b.txCount + 1)
        }

        val dupIds = duplicateBillPayments(payments, transactions, dayTolerance)
            .map { it.payment.id }.toSet()

        for (p in paymentsOfType(payments, "bill")) {
            if (p.id in dupIds) continue
            val mk = monthKey(p.date, p.monthKey)
            if (mk.isEmpty()) continue
            val b = out[mk] ?: MonthSpending()
            out[mk] = b.copy(fromBills = b.fromBills + p.amount)
        }

        // Transfers: recorded for disclosure, never added to spending.
        for (p in paymentsOfType(payments, "card")) {
            val mk = monthKey(p.date, p.monthKey)
            if (mk.isEmpty()) continue
            val b = out[mk] ?: MonthSpending()
            out[mk] = b.copy(cardPaymentsExcluded = b.cardPaymentsExcluded + p.amount)
        }

        return out.mapValues { (_, b) ->
            b.copy(
                spending = b.fromTransactions + b.fromBills,
                // Card payments went out but nothing explains what was bought.
                blind = b.cardPaymentsExcluded > 0 && b.txCount == 0,
            )
        }
    }

    /** Calendar month keys ending at [from] (a "YYYY-MM"), oldest first —
     *  chronological, the order a time series is read in. */
    fun monthKeysThrough(count: Int, from: String): List<String> {
        val parts = from.split("-")
        if (parts.size < 2) return emptyList()
        var y = parts[0].toIntOrNull() ?: return emptyList()
        var m = parts[1].toIntOrNull() ?: return emptyList()
        val keys = mutableListOf<String>()
        repeat(maxOf(0, count)) {
            keys.add("%04d-%02d".format(y, m))
            m -= 1
            if (m < 1) { m = 12; y -= 1 }
        }
        return keys.reversed()
    }

    /**
     * The chart's rows, oldest → newest.
     *
     * The window is CLAMPED to start at the first month with any outflow
     * record. Income synthesizes arbitrarily far back, so an unclamped window
     * would draw full income against zero spending for every month before the
     * user started logging — an enormous fake surplus tapering into reality
     * exactly where the real data begins.
     */
    fun series(
        settings: JsonObject,
        payments: List<Payment>,
        transactions: List<SpendTransaction>,
        months: Int = 18,
        from: String,
        dayTolerance: Int = 1,
    ): Series {
        val byMonth = monthlySpending(payments, transactions, dayTolerance)
        val recorded = byMonth
            .filterValues { it.spending > 0 || it.cardPaymentsExcluded > 0 }
            .keys.sorted()

        val earliest = recorded.firstOrNull()
            ?: return Series(emptyList(), 0, incomeProjected = true, firstRecorded = "")

        val keys = monthKeysThrough(maxOf(1, months), from).filter { it >= earliest }

        val rows = keys.map { mk ->
            val b = byMonth[mk]
            val income = Income.monthlyIncome(settings, mk)
            val spending = b?.spending ?: 0.0
            Row(
                mk = mk,
                income = income,
                spending = spending,
                net = income - spending,
                fromTransactions = b?.fromTransactions ?: 0.0,
                fromBills = b?.fromBills ?: 0.0,
                cardPaymentsExcluded = b?.cardPaymentsExcluded ?: 0.0,
                // No bucket at all inside the window is just as blind as
                // card-payments-with-no-transactions: a zero here would be a
                // fabricated zero.
                blind = b?.blind ?: true,
            )
        }

        return Series(
            rows = rows,
            blindMonths = rows.count { it.blind },
            incomeProjected = true,
            firstRecorded = earliest,
        )
    }
}
