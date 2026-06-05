import Foundation

/// One upcoming bill/card payment, as built by `buildUpcomingItems`.
public struct UpcomingItem: Equatable, Sendable, Identifiable {
    public var name: String
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
        now: Date = Date()
    ) -> [UpcomingItem] {
        var items: [UpcomingItem] = []

        for b in bills {
            guard let dd = b.dueDay, dd != 0 else { continue }
            items.append(UpcomingItem(
                name: b.name,
                amount: b.amount,
                days: DateLogic.daysUntilDue(dueDay: dd, tz: tz, now: now),
                nextDue: DateLogic.nextDueDate(dueDay: dd, tz: tz, now: now),
                type: "bill",
                refId: String(b.id),
                autopay: b.autopay,
                icon: CTConstants.icon(forCategory: b.category)
            ))
        }

        for c in cards {
            guard let dd = c.dueDay, dd != 0 else { continue }
            let needed = c.hasPromo
                ? max(c.minPayment, promoNeeded(c, tz: tz, now: now))
                : c.minPayment
            items.append(UpcomingItem(
                name: c.name + " (payment)",
                amount: needed,
                days: DateLogic.daysUntilDue(dueDay: dd, tz: tz, now: now),
                nextDue: DateLogic.nextDueDate(dueDay: dd, tz: tz, now: now),
                type: "card",
                refId: String(c.id),
                autopay: c.autopay,
                icon: CTConstants.cardIcon
            ))
        }

        items.sort { $0.days < $1.days }
        return items
    }

    /// True if a payment exists for this bill/card in the given month.
    public static func isPaid(
        _ payments: [Payment],
        type: String,
        refId: String,
        monthKey: String
    ) -> Bool {
        payments.contains {
            $0.type == type && $0.refId == refId && $0.monthKey == monthKey
        }
    }

    /// Total paid toward this bill/card in the given month.
    public static func paidAmount(
        _ payments: [Payment],
        type: String,
        refId: String,
        monthKey: String
    ) -> Double {
        payments
            .filter { $0.type == type && $0.refId == refId && $0.monthKey == monthKey }
            .reduce(0) { $0 + $1.amount }
    }

    /// Cent-level tolerance so a goal met to the penny reads as full.
    public static let paidEpsilon = 0.005

    /// The "recommended" payment for a card. A per-card override wins;
    /// otherwise promo cards spread the balance to clear it before the
    /// promo ends (never below the minimum) and non-promo cards recommend
    /// paying off the remaining balance. Mirrors recommendedAmount in utils.js.
    public static func recommendedAmount(_ card: Card, tz: TimeZone, now: Date = Date()) -> Double {
        if let override = card.recommendedPayment, override > 0 { return override }
        return card.hasPromo ? max(card.minPayment, promoNeeded(card, tz: tz, now: now)) : card.balance
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
        switch policy {
        case .minimum: return card.minPayment
        case .full:    return startBalance
        case .recommended:
            if let override = card.recommendedPayment, override > 0 { return override }
            if card.hasPromo { return max(card.minPayment, promoNeeded(card, tz: tz, now: now)) }
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
