import Foundation

/// Period-over-period spending category deltas — port of spendingInsights.js.
public enum SpendingInsights {
    public struct Row: Equatable, Sendable {
        public var cat: String
        public var now: Double
        public var was: Double
        public var delta: Double
        public var pct: Int
    }

    private static let categories = spendingCategories

    public static func spentByCategory(_ transactions: [SpendTransaction], bounds: PeriodBounds) -> [String: Double] {
        var m: [String: Double] = [:]
        for t in transactions {
            guard BudgetRules.transactionInPeriod(t.date, bounds: bounds) else { continue }
            let cat = t.category.isEmpty ? "Other" : t.category
            m[cat, default: 0] += t.amount
        }
        return m
    }

    /// Compare current vs previous period spending by category, largest swings first.
    public static func compute(
        _ transactions: [SpendTransaction],
        currentBounds: PeriodBounds,
        prevBounds: PeriodBounds
    ) -> [Row] {
        let cur = spentByCategory(transactions, bounds: currentBounds)
        let prev = spentByCategory(transactions, bounds: prevBounds)
        var cats = Set(categories)
        cats.formUnion(cur.keys)
        cats.formUnion(prev.keys)

        var rows: [Row] = []
        for cat in cats {
            let now = cur[cat] ?? 0
            let was = prev[cat] ?? 0
            if now <= 0 && was <= 0 { continue }
            let delta = now - was
            let pct: Int
            if was > 0 {
                pct = Int((delta / was * 100).rounded())
            } else {
                pct = now > 0 ? 100 : 0
            }
            rows.append(Row(cat: cat, now: now, was: was, delta: delta, pct: pct))
        }
        rows.sort { abs($0.delta) > abs($1.delta) }
        return rows
    }
}
