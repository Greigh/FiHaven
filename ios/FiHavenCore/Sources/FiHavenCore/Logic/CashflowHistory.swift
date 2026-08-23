import Foundation

/// Monthly income vs. spending, merged from both outflow stores with
/// card-payment deduplication.
///
/// FiHaven records money leaving your pocket in TWO places: `transactions`
/// (purchases, typed or bank-imported) and `payments` (bills and card payments
/// marked paid). Naively summing them double-counts. A CARD payment is a
/// transfer between your own accounts, not an expenditure: the purchases it
/// settles were already recorded as transactions on that card. So card payments
/// never count as spending — each month instead reports how much was held out
/// (`cardPaymentsExcluded`) and whether any transaction coverage exists. A month
/// with card payments and no transactions is BLIND, and callers are expected to
/// say so rather than render a misleadingly low figure.
///
/// BILL payments ARE real outflows and are counted, minus any that duplicate a
/// logged transaction (rent typed into Spending AND marked paid on Bills). That
/// match reuses `Reconcile.looksSame`'s deliberately conservative rule.
///
/// Income is NOT a recorded history: `Income.monthlyIncome(from:monthKey:)`
/// projects today's configured income backwards over every month, varying only
/// by adjustments. `Series.incomeProjected` exists so the UI can caption that
/// honestly instead of implying it measured anything.
///
/// Mirrors the web `cashflowHistory.js` (and Android `CashflowHistory.kt`) —
/// change all three together.
public enum CashflowHistory {

    /// Per-month outflow. `spending` is the figure to plot; the rest is
    /// provenance so the UI can explain it and flag where it can't be trusted.
    public struct MonthSpending: Equatable, Sendable {
        public var spending: Double = 0
        public var fromTransactions: Double = 0
        public var fromBills: Double = 0
        public var cardPaymentsExcluded: Double = 0
        public var txCount: Int = 0
        public var blind: Bool = false
    }

    public struct Row: Equatable, Sendable {
        public let mk: String
        public let income: Double
        public let spending: Double
        public let net: Double
        public let fromTransactions: Double
        public let fromBills: Double
        public let cardPaymentsExcluded: Double
        public let blind: Bool
    }

    public struct Series: Equatable, Sendable {
        public let rows: [Row]
        public let blindMonths: Int
        /// Always true today — income derives from current settings, not stored
        /// per month. Flip when income gains real per-month history.
        public let incomeProjected: Bool
        public let firstRecorded: String
    }

    public struct BillDuplicate: Equatable, Sendable {
        public let payment: Payment
        public let transaction: SpendTransaction
    }

    /// The "YYYY-MM" calendar bucket a dated record falls in. Falls back to a
    /// stored monthKey for date-less rows; a non-calendar period key
    /// ("YYYY-MM-DD") still slices down to the right calendar month.
    public static func monthKey(date: String, monthKey mk: String = "") -> String {
        if date.count >= 7 { return String(date.prefix(7)) }
        if mk.count >= 7 { return String(mk.prefix(7)) }
        return ""
    }

    /// A payment reshaped for `Reconcile.looksSame`, which speaks transactions.
    /// A payment's `name` ("Rent") plays the merchant role.
    private static func matchable(_ p: Payment) -> SpendTransaction {
        SpendTransaction(id: p.id, date: p.date, amount: p.amount, merchant: p.name)
    }

    /// Real (non-skipped) payments of one type. Skips are stored as payments
    /// with amount 0 and `skipped` set — they are not outflows.
    private static func payments(_ list: [Payment], ofType type: String) -> [Payment] {
        list.filter { !$0.skipped && $0.type == type }
    }

    /// Bill payments that duplicate an already-logged transaction. Each
    /// transaction backs at most one payment. Conservative by construction:
    /// `looksSame` requires a real name on BOTH sides (≥3 chars normalized) and
    /// a date within ±1 day, so an unnamed transaction never silently absorbs a
    /// bill.
    public static func duplicateBillPayments(
        _ paymentList: [Payment],
        _ transactions: [SpendTransaction],
        tz: TimeZone,
        dayTolerance: Int = 1
    ) -> [BillDuplicate] {
        var used = Set<String>()
        var dups: [BillDuplicate] = []
        for p in payments(paymentList, ofType: "bill") {
            let probe = matchable(p)
            if let m = transactions.first(where: {
                !used.contains($0.id) && Reconcile.looksSame(probe, $0, tz: tz, dayTolerance: dayTolerance)
            }) {
                used.insert(m.id)
                dups.append(BillDuplicate(payment: p, transaction: m))
            }
        }
        return dups
    }

    /// Per-calendar-month outflow, keyed "YYYY-MM".
    public static func monthlySpending(
        _ paymentList: [Payment],
        _ transactions: [SpendTransaction],
        tz: TimeZone,
        dayTolerance: Int = 1
    ) -> [String: MonthSpending] {
        var out: [String: MonthSpending] = [:]

        for t in transactions {
            // A card payment is a transfer, not an outflow to plot — the
            // purchases it settles are already here under their own months.
            if !t.countsAsSpending { continue }
            let mk = monthKey(date: t.date)
            if mk.isEmpty { continue }
            var b = out[mk] ?? MonthSpending()
            b.fromTransactions += t.amount
            b.txCount += 1
            out[mk] = b
        }

        let dupIds = Set(
            duplicateBillPayments(paymentList, transactions, tz: tz, dayTolerance: dayTolerance)
                .map { $0.payment.id }
        )

        for p in payments(paymentList, ofType: "bill") where !dupIds.contains(p.id) {
            let mk = monthKey(date: p.date, monthKey: p.monthKey)
            if mk.isEmpty { continue }
            var b = out[mk] ?? MonthSpending()
            b.fromBills += p.amount
            out[mk] = b
        }

        // Transfers: recorded for disclosure, never added to spending.
        for p in payments(paymentList, ofType: "card") {
            let mk = monthKey(date: p.date, monthKey: p.monthKey)
            if mk.isEmpty { continue }
            var b = out[mk] ?? MonthSpending()
            b.cardPaymentsExcluded += p.amount
            out[mk] = b
        }

        for (mk, var b) in out {
            b.spending = b.fromTransactions + b.fromBills
            // Card payments went out but nothing explains what was bought.
            b.blind = b.cardPaymentsExcluded > 0 && b.txCount == 0
            out[mk] = b
        }
        return out
    }

    /// Calendar month keys ending at `from` (a "YYYY-MM"), oldest first —
    /// chronological, the order a time series is read in.
    public static func monthKeysThrough(_ count: Int, from mk: String) -> [String] {
        let parts = mk.split(separator: "-")
        guard parts.count >= 2, var y = Int(parts[0]), var m = Int(parts[1]) else { return [] }
        var keys: [String] = []
        for _ in 0..<max(0, count) {
            keys.append(String(format: "%04d-%02d", y, m))
            m -= 1
            if m < 1 { m = 12; y -= 1 }
        }
        return keys.reversed()
    }

    /// The chart's rows, oldest → newest.
    ///
    /// The window is CLAMPED to start at the first month with any outflow
    /// record. Income synthesizes arbitrarily far back, so an unclamped window
    /// would draw full income against zero spending for every month before the
    /// user started logging — an enormous fake surplus tapering into reality
    /// exactly where the real data begins.
    public static func series(
        settings: Settings,
        payments paymentList: [Payment],
        transactions: [SpendTransaction],
        months: Int = 18,
        from: String,
        tz: TimeZone,
        dayTolerance: Int = 1
    ) -> Series {
        let byMonth = monthlySpending(paymentList, transactions, tz: tz, dayTolerance: dayTolerance)
        let recorded = byMonth
            .filter { $0.value.spending > 0 || $0.value.cardPaymentsExcluded > 0 }
            .keys.sorted()

        guard let earliest = recorded.first else {
            return Series(rows: [], blindMonths: 0, incomeProjected: true, firstRecorded: "")
        }

        let keys = monthKeysThrough(max(1, months), from: from).filter { $0 >= earliest }

        let rows: [Row] = keys.map { mk in
            let b = byMonth[mk]
            let income = Income.monthlyIncome(from: settings, monthKey: mk)
            let spending = b?.spending ?? 0
            return Row(
                mk: mk,
                income: income,
                spending: spending,
                net: income - spending,
                fromTransactions: b?.fromTransactions ?? 0,
                fromBills: b?.fromBills ?? 0,
                cardPaymentsExcluded: b?.cardPaymentsExcluded ?? 0,
                // No bucket at all inside the window is just as blind as
                // card-payments-with-no-transactions: a zero here would be a
                // fabricated zero.
                blind: b?.blind ?? true
            )
        }

        return Series(
            rows: rows,
            blindMonths: rows.filter { $0.blind }.count,
            incomeProjected: true,
            firstRecorded: earliest
        )
    }
}
