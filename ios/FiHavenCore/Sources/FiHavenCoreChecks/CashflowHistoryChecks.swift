import Foundation
import FiHavenCore

// Mirrors client/js/cashflowHistory.test.js — same cases, same expectations.
func runCashflowHistoryChecks() {
    let tz = utcTZ

    func tx(_ id: String, _ date: String, _ amount: Double, _ merchant: String = "") -> SpendTransaction {
        SpendTransaction(id: id, date: date, amount: amount, merchant: merchant)
    }
    func pay(_ id: String, _ type: String, _ name: String, _ amount: Double,
             _ date: String, skipped: Bool = false) -> Payment {
        Payment(id: id, type: type, refId: "R1", name: name, amount: amount,
                date: date, monthKey: String(date.prefix(7)), skipped: skipped)
    }

    section("CashflowHistory — monthKey bucketing") {
        checkEqual(CashflowHistory.monthKey(date: "2026-06-15"), "2026-06", "from a date")
        checkEqual(CashflowHistory.monthKey(date: "", monthKey: "2026-04"), "2026-04", "date-less falls back")
        checkEqual(CashflowHistory.monthKey(date: "", monthKey: ""), "", "nothing to bucket by")
        checkEqual(CashflowHistory.monthKey(date: "", monthKey: "2026-06-25"), "2026-06",
                   "non-calendar period key slices to its month")
    }

    section("CashflowHistory — card payments are transfers, not spending") {
        let payments = [
            pay("c1", "card", "Chase Sapphire", 800, "2026-06-05"),
            pay("b1", "bill", "Rent", 1500, "2026-06-01"),
        ]
        let txs = [tx("t1", "2026-06-10", 120, "Costco"), tx("t2", "2026-06-12", 45, "Shell")]

        let m = CashflowHistory.monthlySpending(payments, txs, tz: tz)["2026-06"]
        checkClose(m?.spending ?? -1, 1665, "1500 rent + 165 purchases")
        checkClose(m?.cardPaymentsExcluded ?? -1, 800, "card payment held out and reported")
        checkEqual(m?.blind ?? true, false, "transactions explain the month")

        let noTx = CashflowHistory.monthlySpending(payments, [], tz: tz)["2026-06"]
        checkClose(noTx?.spending ?? -1, 1500, "the bill still counts")
        checkEqual(noTx?.blind ?? false, true, "card payments with no transactions → blind")

        let skips = [pay("s1", "bill", "Rent", 0, "2026-06-01", skipped: true)]
        checkEqual(CashflowHistory.monthlySpending(skips, [], tz: tz)["2026-06"] == nil, true,
                   "skipped payments are not outflows")
    }

    section("CashflowHistory — bill/transaction deduplication") {
        let bill = [pay("b1", "bill", "Verizon", 90, "2026-06-03")]

        let matched = [tx("t1", "2026-06-03", 90, "Verizon")]
        checkEqual(CashflowHistory.duplicateBillPayments(bill, matched, tz: tz).count, 1, "duplicate found")
        checkClose(CashflowHistory.monthlySpending(bill, matched, tz: tz)["2026-06"]?.spending ?? -1, 90,
                   "counted once, from the transaction side")

        let unnamed = [tx("t1", "2026-06-03", 90, "")]
        checkEqual(CashflowHistory.duplicateBillPayments(bill, unnamed, tz: tz).count, 0,
                   "no merchant to match on")
        checkClose(CashflowHistory.monthlySpending(bill, unnamed, tz: tz)["2026-06"]?.spending ?? -1, 180,
                   "both kept when unmatched")

        let twoBills = [pay("b1", "bill", "Verizon", 90, "2026-06-03"),
                        pay("b2", "bill", "Verizon", 90, "2026-06-03")]
        checkEqual(CashflowHistory.duplicateBillPayments(twoBills, matched, tz: tz).count, 1,
                   "each transaction absorbs at most one bill")
        checkClose(CashflowHistory.monthlySpending(twoBills, matched, tz: tz)["2026-06"]?.spending ?? -1, 180,
                   "90 tx + 90 surviving bill")
    }

    section("CashflowHistory — monthKeysThrough") {
        checkEqual(CashflowHistory.monthKeysThrough(3, from: "2026-06"),
                   ["2026-04", "2026-05", "2026-06"], "chronological, ending at `from`")
        checkEqual(CashflowHistory.monthKeysThrough(3, from: "2026-01"),
                   ["2025-11", "2025-12", "2026-01"], "crosses a year boundary")
    }

    section("CashflowHistory — series") {
        var settings = Settings()
        settings.income = 5000

        let clampPayments = [pay("b1", "bill", "Rent", 1500, "2026-05-01")]
        let clampTxs = [tx("t1", "2026-06-10", 200, "Costco")]
        let clamped = CashflowHistory.series(settings: settings, payments: clampPayments,
                                             transactions: clampTxs, months: 18, from: "2026-06", tz: tz)
        checkEqual(clamped.firstRecorded, "2026-05", "clamps to the first recorded month")
        checkEqual(clamped.rows.map { $0.mk }, ["2026-05", "2026-06"], "18 requested, 2 have records")

        let junePayments = [pay("b1", "bill", "Rent", 1500, "2026-06-01")]
        let net = CashflowHistory.series(settings: settings, payments: junePayments,
                                         transactions: clampTxs, months: 6, from: "2026-06", tz: tz)
        if let june = net.rows.first(where: { $0.mk == "2026-06" }) {
            checkClose(june.income, 5000, "income")
            checkClose(june.spending, 1700, "1500 bill + 200 purchase")
            checkClose(june.net, 3300, "net = income − spending")
        } else {
            check(false, "June row present")
        }

        var bonus = Settings()
        bonus.income = 5000
        bonus.incomeAdjustments = [IncomeAdjustment(id: "a1", amount: 1000, kind: "once", monthKey: "2026-06")]
        let adjusted = CashflowHistory.series(settings: bonus, payments: clampPayments,
                                              transactions: [], months: 6, from: "2026-06", tz: tz)
        checkClose(adjusted.rows.first(where: { $0.mk == "2026-05" })?.income ?? -1, 5000, "May unaffected")
        checkClose(adjusted.rows.first(where: { $0.mk == "2026-06" })?.income ?? -1, 6000, "June gets the bonus")

        let gapPayments = [pay("b1", "bill", "Rent", 1500, "2026-04-01"),
                           pay("b2", "bill", "Rent", 1500, "2026-06-01")]
        let gapped = CashflowHistory.series(settings: settings, payments: gapPayments,
                                            transactions: [], months: 6, from: "2026-06", tz: tz)
        checkEqual(gapped.rows.map { $0.mk }, ["2026-04", "2026-05", "2026-06"], "window spans the gap")
        checkEqual(gapped.rows.first(where: { $0.mk == "2026-05" })?.blind ?? false, true,
                   "an unrecorded in-window month is blind, not zero")
        checkEqual(gapped.blindMonths, 1, "blind month counted")

        let empty = CashflowHistory.series(settings: settings, payments: [], transactions: [],
                                           months: 18, from: "2026-06", tz: tz)
        checkEqual(empty.rows.isEmpty, true, "nothing recorded → empty series")
        checkEqual(empty.firstRecorded, "", "no first recorded month")

        checkEqual(net.incomeProjected, true, "income is projected, never measured")
    }
}
