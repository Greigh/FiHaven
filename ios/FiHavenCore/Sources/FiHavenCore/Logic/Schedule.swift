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
    public var icon: CategoryIcon

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
        categoryIcons: [String: CategoryIcon] = [:],
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
                icon: CTConstants.iconInfo(forCategory: b.category, overrides: categoryIcons)
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
                icon: IssuerIcons.iconInfo(for: c)
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
        goalAmount(
            card: card, policy: policy,
            paid: paidAmount(payments, type: "card", refId: String(card.id), in: bounds),
            tz: tz, now: now
        )
    }

    /// Cent-level tolerance so a goal met to the penny reads as full.
    public static let paidEpsilon = 0.005

    // ── The three amounts on a card ─────────────────────────────────
    /// What's actually on the card right now. `balance` is the statement
    /// balance — what's due by the due date — while `currentBalance` (typed
    /// in, or pushed by a bank sync) is the live figure including charges made
    /// since the statement closed. Utilization follows the live figure because
    /// that's what the issuer reports. Unset means "not tracked separately",
    /// so fall back to the statement. Mirrors liveCardBalance in utils.js.
    public static func liveBalance(_ card: Card) -> Double {
        card.currentBalance ?? card.balance
    }

    /// The three amounts a card row can lead with, resolved together so the
    /// headline and its companion figures can never disagree.
    public struct CardAmounts: Equatable {
        /// Statement balance — a loan's is its scheduled payment.
        public let due: Double
        /// Live balance, the one utilization is measured against.
        public let current: Double
        /// Still owed this period under the paid-goal policy (0 if skipped).
        public let owed: Double

        public init(due: Double, current: Double, owed: Double) {
            self.due = due
            self.current = current
            self.owed = owed
        }

        /// The amount named by a `Settings.cardHeadline` value.
        public func value(for headline: String) -> Double {
            switch headline {
            case "current": return current
            case "owed":    return owed
            default:        return due
            }
        }
    }

    public static func amounts(
        card: Card,
        policy: PaidGoalPolicy,
        payments: [Payment],
        in bounds: PeriodBounds,
        tz: TimeZone,
        now: Date = Date()
    ) -> CardAmounts {
        let ref = String(card.id)
        let isLoan = (card.type ?? "card") == "loan"
        let goal = goalAmount(card: card, policy: policy, payments: payments, in: bounds, tz: tz, now: now)
        let owed = isSkipped(payments, type: "card", refId: ref, in: bounds)
            ? 0
            : remainingForGoal(type: "card", refId: ref, goal: goal, payments: payments, in: bounds)
        return CardAmounts(
            due: isLoan ? card.minPayment : card.balance,
            current: liveBalance(card),
            owed: owed
        )
    }

    /// The two amounts a row isn't leading with, in a stable order. The
    /// preference re-ranks the three; it never hides one.
    public static func otherAmounts(than headline: String) -> [String] {
        ["due", "current", "owed"].filter { $0 != headline }
    }

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

    // ── Pay targets ─────────────────────────────────────────────────
    /// One target a payment can aim at this period. `payTarget` gives the
    /// target itself and `payRemaining` what's left of it after the payments
    /// already recorded. Mirrors payTargetAmount in utils.js.
    public enum PayTarget: Sendable {
        /// A bill's whole amount (the only target a bill has).
        case full
        /// The card's minimum payment.
        case minimum
        /// The payoff-aware recommendation.
        case recommended
        /// A loan's scheduled monthly payment.
        case monthly
        /// The whole start-of-period balance (a loan's remaining principal).
        case payoff
    }

    /// The card as it stood at the start of the period, payments undone. Card
    /// payments decrement the live balance, so balance-derived targets add
    /// this period's payments back: the target holds still while the
    /// remainder shrinks as installments land.
    static func cardAtPeriodStart(_ card: Card, paid: Double) -> Card {
        guard paid > 0 else { return card }
        var start = card
        start.balance = card.balance + paid
        if let promo = card.promoBalance { start.promoBalance = promo + paid }
        return start
    }

    /// This period's target for one pay preset, before payments are subtracted.
    public static func payTarget(
        _ kind: PayTarget,
        card: Card,
        paid: Double,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        switch kind {
        case .minimum:
            return card.minPayment
        case .monthly:
            if let override = card.recommendedPayment, override > 0 { return override }
            return card.minPayment
        case .payoff, .full:
            return cardAtPeriodStart(card, paid: paid).balance
        case .recommended:
            return recommendedAmount(cardAtPeriodStart(card, paid: paid), tz: tz, now: now)
        }
    }

    /// What's left toward a target after this period's payments (never below 0).
    public static func payRemaining(
        _ kind: PayTarget,
        card: Card,
        paid: Double,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        max(0, payTarget(kind, card: card, paid: paid, tz: tz, now: now) - paid)
    }

    /// A bill's fully-paid goal is always its full amount.
    public static func goalAmount(bill: Bill) -> Double { bill.amount }

    /// A card's fully-paid goal this period — the pay target the active policy
    /// names (mirrors goalAmountFor in utils.js). `paid` is what's already been
    /// paid this period; balance-derived targets add it back so the goal stays
    /// stable as installments land.
    public static func goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        paid: Double,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type ?? "card") == "loan" {
            return payTarget(.monthly, card: card, paid: paid, tz: tz, now: now)
        }
        switch policy {
        case .minimum:     return payTarget(.minimum, card: card, paid: paid, tz: tz, now: now)
        case .full:        return payTarget(.payoff, card: card, paid: paid, tz: tz, now: now)
        case .recommended: return payTarget(.recommended, card: card, paid: paid, tz: tz, now: now)
        }
    }

    public static func goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: [Payment],
        monthKey: String,
        tz: TimeZone,
        now: Date = Date()
    ) -> Double {
        goalAmount(
            card: card, policy: policy,
            paid: paidAmount(payments, type: "card", refId: String(card.id), monthKey: monthKey),
            tz: tz, now: now
        )
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
