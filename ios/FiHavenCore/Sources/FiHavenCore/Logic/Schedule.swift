import Foundation

/// One upcoming bill/card payment, as built by `buildUpcomingItems`.
public struct UpcomingItem: Equatable, Sendable, Identifiable {
    public var name: String
    /// Who it's actually paid to (a bill's business / a card's issuer). The name
    /// is often a nickname ("Phone"), so this is what identifies the payee.
    public var business: String = ""
    public var amount: Double
    public var days: Int
    public var nextDue: Date?
    public var type: String        // "bill" | "card"
    public var refId: String
    public var autopay: Bool
    public var icon: String

    // Stable id for SwiftUI lists.
    public var id: String { "\(type)-\(refId)" }
}

/// Upcoming-items + paid-state helpers, ported from utils.js.
public enum Schedule {
    /// Suggested payment toward a promo card this month: the promo balance
    /// (or full balance) spread over the months left before the promo
    /// ends, or the whole balance if the promo has ended.
    /// Mirrors `promoNeeded` in utils.js.
    public static func promoNeeded(_ card: Card, tz: TimeZone, now: Date = Date()) -> Double {
        // parseFloat(promoBalance) || parseFloat(balance) || 0
        let bal: Double
        if let pb = card.promoBalance, pb != 0 {
            bal = pb
        } else if card.balance != 0 {
            bal = card.balance
        } else {
            bal = 0
        }
        let months = DateLogic.monthsUntil(card.promoEndDate, tz: tz, now: now)
        return months <= 0 ? bal : bal / Double(months)
    }

    /// Build the sorted (soonest-first) list of upcoming bill/card payments.
    public static func buildUpcomingItems(
        bills: [Bill],
        cards: [Card],
        tz: TimeZone,
        payments: [Payment] = [],
        bounds: PeriodBounds? = nil,
        policy: PaidGoalPolicy = .recommended,
        now: Date = Date()
    ) -> [UpcomingItem] {
        var items: [UpcomingItem] = []

        for b in bills {
            guard b.dueDay != nil || !(b.startDate ?? "").isEmpty else { continue }
            guard DateLogic.billActive(b, tz: tz, now: now) else { continue }
            let ref = String(b.id)
            let days: Int
            if let bounds {
                let paid = remainingForGoal(
                    type: "bill", refId: ref, goal: goalAmount(bill: b),
                    payments: payments, in: bounds
                ) <= paidEpsilon
                days = BillSchedule.effectiveDaysUntilDue(b, whenFullyPaid: paid, tz: tz, now: now)
            } else {
                days = BillSchedule.daysUntilDue(b, tz: tz, now: now)
            }
            items.append(UpcomingItem(
                name: b.name,
                business: b.business ?? "",
                amount: b.amount,
                days: days,
                nextDue: BillSchedule.nextDueDate(b, tz: tz, from: now),
                type: "bill",
                refId: ref,
                autopay: b.autopay,
                icon: CTConstants.icon(forCategory: b.category)
            ))
        }

        for c in cards {
            guard let dd = c.dueDay, dd != 0 else { continue }
            let needed = c.hasPromo
                ? max(c.minPayment, promoNeeded(c, tz: tz, now: now))
                : c.minPayment
            let ref = String(c.id)
            let days: Int
            if let bounds {
                let goal = goalAmount(card: c, policy: policy, payments: payments, in: bounds, tz: tz, now: now)
                let paid = remainingForGoal(
                    type: "card", refId: ref, goal: goal,
                    payments: payments, in: bounds
                ) <= paidEpsilon
                days = DateLogic.effectiveDaysUntilDue(dueDay: dd, whenFullyPaid: paid, tz: tz, now: now)
            } else {
                days = DateLogic.daysUntilDue(dueDay: dd, tz: tz, now: now)
            }
            items.append(UpcomingItem(
                name: c.name + " (payment)",
                business: c.issuer ?? "",
                amount: needed,
                days: days,
                nextDue: DateLogic.nextDueDate(dueDay: dd, tz: tz, now: now),
                type: "card",
                refId: ref,
                autopay: c.autopay,
                icon: CTConstants.cardIcon
            ))
        }

        items.sort { $0.days < $1.days }
        return items
    }

    private static func remainingForGoal(
        type: String,
        refId: String,
        goal: Double,
        payments: [Payment],
        in bounds: PeriodBounds
    ) -> Double {
        max(0, goal - paidAmount(payments, type: type, refId: refId, in: bounds))
    }

    /// True if a (real, non-skip) payment exists for this bill/card in the month.
    public static func isPaid(
        _ payments: [Payment],
        type: String,
        refId: String,
        monthKey: String
    ) -> Bool {
        payments.contains {
            !$0.skipped && $0.type == type && $0.refId == refId && $0.monthKey == monthKey
        }
    }

    /// True if this bill/card has been skipped for the given month. A skip is
    /// a payment record flagged `skipped` (amount 0): it owes nothing and drops
    /// out of "still owed", but isn't a real payment.
    public static func isSkipped(
        _ payments: [Payment],
        type: String,
        refId: String,
        monthKey: String
    ) -> Bool {
        payments.contains {
            $0.skipped && $0.type == type && $0.refId == refId && $0.monthKey == monthKey
        }
    }

    /// Total paid toward this bill/card in the given month (skips excluded).
    public static func paidAmount(
        _ payments: [Payment],
        type: String,
        refId: String,
        monthKey: String
    ) -> Double {
        payments
            .filter { !$0.skipped && $0.type == type && $0.refId == refId && $0.monthKey == monthKey }
            .reduce(0) { $0 + $1.amount }
    }

    // ── Period-aware variants (match by date range, see Period) ──────
    public static func isPaid(_ payments: [Payment], type: String, refId: String, in bounds: PeriodBounds) -> Bool {
        payments.contains { !$0.skipped && $0.type == type && $0.refId == refId && bounds.contains($0) }
    }

    public static func isSkipped(_ payments: [Payment], type: String, refId: String, in bounds: PeriodBounds) -> Bool {
        payments.contains { $0.skipped && $0.type == type && $0.refId == refId && bounds.contains($0) }
    }

    public static func paidAmount(_ payments: [Payment], type: String, refId: String, in bounds: PeriodBounds) -> Double {
        payments
            .filter { !$0.skipped && $0.type == type && $0.refId == refId && bounds.contains($0) }
            .reduce(0) { $0 + $1.amount }
    }

    // ── Monthly rollover ────────────────────────────────────────────
    /// Average of a bill/card's recent (non-skip) payment amounts — the
    /// "average of recent months" seed for the rollover review. Nil when
    /// there's no history to average. Mirrors recentPaymentAverage in utils.js.
    public static func recentPaymentAverage(_ payments: [Payment], type: String, refId: String, n: Int = 6) -> Double? {
        let recent = payments
            .filter { !$0.skipped && $0.type == type && $0.refId == refId }
            .sorted { $0.date > $1.date }
            .prefix(n)
        if recent.isEmpty { return nil }
        return recent.reduce(0) { $0 + $1.amount } / Double(recent.count)
    }

    /// Amount to pre-fill for a bill when a new period starts, under the active
    /// policy: "average" (default) → recentAvg (else current); "carry" →
    /// current; "blank" → 0. Mirrors rolloverAmount in utils.js.
    public static func rolloverAmount(mode: String, currentAmount: Double, recentAvg: Double?) -> Double {
        switch mode {
        case "carry": return currentAmount
        case "blank": return 0
        default:
            if let avg = recentAvg, avg.isFinite, avg > 0 { return avg }
            return currentAmount
        }
    }

    public static func goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: [Payment],
        in bounds: PeriodBounds,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        let paid = paidAmount(payments, type: "card", refId: String(card.id), in: bounds)
        let startBalance = card.balance + paid
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type ?? "card") == "loan" {
            if let override = card.recommendedPayment, override > 0 { return override }
            return card.minPayment
        }
        switch policy {
        case .minimum: return card.minPayment
        case .full:    return startBalance
        case .recommended:
            if let override = card.recommendedPayment, override > 0 { return override }
            if card.hasPromo { return max(card.minPayment, promoNeeded(card, tz: tz, now: now)) }
            // 0% interest (no active promo): no interest cost to carry, so the
            // goal is just the minimum rather than the full balance.
            if card.regularAPR <= 0 { return card.minPayment }
            return startBalance
        }
    }

    /// Cent-level tolerance so a goal met to the penny reads as full.
    public static let paidEpsilon = 0.005

    /// The "recommended" payment for a card. A per-card override wins;
    /// otherwise promo cards spread the balance to clear it before the
    /// promo ends (never below the minimum) and non-promo cards recommend
    /// paying off the remaining balance. Mirrors recommendedAmount in utils.js.
    public static func recommendedAmount(_ card: Card, tz: TimeZone, now: Date = Date()) -> Double {
        if let override = card.recommendedPayment, override > 0 { return override }
        // Loans: the recommended payment is the scheduled monthly payment, never
        // the whole principal (paying it off is still an explicit option).
        if (card.type ?? "card") == "loan" { return card.minPayment }
        if card.hasPromo { return max(card.minPayment, promoNeeded(card, tz: tz, now: now)) }
        // 0% interest (no active promo): carrying a balance costs nothing, so the
        // recommended payment is just the minimum — not the whole balance.
        if card.regularAPR <= 0 { return card.minPayment }
        return card.balance
    }

    /// A bill's fully-paid goal is always its full amount.
    public static func goalAmount(bill: Bill) -> Double { bill.amount }

    /// A card's fully-paid goal under the active policy. For `.full`,
    /// card payments decrement the live balance, so this month's
    /// payments are added back to keep the goal stable as installments
    /// land (mirrors goalAmountFor in utils.js).
    public static func goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: [Payment],
        monthKey: String,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        let paid = paidAmount(payments, type: "card", refId: String(card.id), monthKey: monthKey)
        // "full" and a non-promo "recommended" both target paying the balance
        // to zero. Card payments decrement the live balance, so add this
        // month's payments back to keep that goal stable across installments.
        let startBalance = card.balance + paid
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type ?? "card") == "loan" {
            if let override = card.recommendedPayment, override > 0 { return override }
            return card.minPayment
        }
        switch policy {
        case .minimum: return card.minPayment
        case .full:    return startBalance
        case .recommended:
            if let override = card.recommendedPayment, override > 0 { return override }
            if card.hasPromo { return max(card.minPayment, promoNeeded(card, tz: tz, now: now)) }
            // 0% interest (no active promo): no interest cost to carry, so the
            // goal is just the minimum rather than the full balance.
            if card.regularAPR <= 0 { return card.minPayment }
            return startBalance
        }
    }
}

/// How much must be paid before a bill/card counts as fully paid.
/// Defaults to `.recommended` (matches settings.paidGoal on the web).
public enum PaidGoalPolicy: String, Sendable {
    case minimum, recommended, full

    public static func from(_ raw: String?) -> PaidGoalPolicy {
        switch raw {
        case "minimum": return .minimum
        case "full":    return .full
        default:        return .recommended
        }
    }
}

/// Tri-state for badges/rows: nothing paid, some paid, goal reached.
public enum PaidState: Sendable {
    case unpaid, partial, full
}
