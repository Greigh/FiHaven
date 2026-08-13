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
                amount: b.amountOrZero,
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
                ? max(c.minPaymentOrZero, promoNeeded(c, tz: tz, now: now))
                : c.minPaymentOrZero
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

    /// Which way a bank's suggested balance moves the debt, and whether its
    /// limit is actually news. See `balanceProposalChange`.
    public struct BalanceChange: Equatable, Sendable {
        public let direction: String
        public let limitChanged: Bool
    }

    /// How a bank's suggested figures compare with what's on the card today,
    /// for the balance-review row.
    ///
    /// `direction` is which way the debt moves — "up" is more owed, so the UI
    /// paints it red. Callers pass `current` from `liveBalance`, because that
    /// is the field accepting a proposal overwrites; comparing against the
    /// statement would report the move from a figure the suggestion never
    /// touches.
    ///
    /// `limitChanged` is false when the bank re-reports the limit already on
    /// file, which keeps unchanged limits out of the row. A first limit on a
    /// card that has none counts as a change.
    ///
    /// Both use `paidEpsilon`, the same cent tolerance the paid-state maths
    /// uses — a re-reported figure differing in float noise is not a change.
    /// Mirrors balanceProposalChange in utils.js.
    public static func balanceProposalChange(
        current: Double?,
        proposed: Double,
        currentLimit: Double?,
        proposedLimit: Double?
    ) -> BalanceChange {
        let direction: String
        if let current, abs(proposed - current) > paidEpsilon {
            direction = proposed > current ? "up" : "down"
        } else {
            direction = "same"
        }
        let limitChanged: Bool = {
            guard let proposedLimit else { return false }
            guard let currentLimit else { return true }
            return abs(proposedLimit - currentLimit) > paidEpsilon
        }()
        return BalanceChange(direction: direction, limitChanged: limitChanged)
    }

    /// Credit utilization as a 0..1 ratio, or nil when there is nothing to
    /// measure against — a loan (no revolving limit) or a card with no limit
    /// set. Always from `liveBalance`, because that is the figure the issuer
    /// reports. Mirrors utilizationOf in utils.js.
    ///
    /// One helper for every caller on purpose: the row, the dashboard alert
    /// and the "highest utilization" sort each derived this separately, and
    /// drifted apart — a row could read 91% while the alert naming it
    /// computed less.
    public static func utilization(_ card: Card) -> Double? {
        guard (card.type ?? "card") != "loan", card.limit > 0 else { return nil }
        return liveBalance(card) / card.limit
    }

    /// What's owed on revolving credit: non-archived, non-loan, at live
    /// balance. Loans share the cards list, so summing it raw puts a mortgage
    /// in the card total. Net worth is the opposite case and counts every
    /// liability.
    public static func cardDebt(_ cards: [Card]) -> Double {
        cards
            .filter { !$0.archived && ($0.type ?? "card") != "loan" }
            .reduce(0) { $0 + liveBalance($1) }
    }

    /// The amounts a card row shows, resolved together so the headline and
    /// its companion figures can never disagree.
    public struct CardAmounts: Equatable {
        /// What to pay this period: the goal the paid-goal policy names, with
        /// a per-card recommended payment overriding it. A loan's is its
        /// scheduled payment.
        ///
        /// This was the raw statement balance, which read "$0.00" — in the
        /// settled green, no less — on a 0% promo card whose statement is
        /// clear but whose monthly payoff installment still has to land.
        public let due: Double
        /// Live balance, the one utilization is measured against.
        public let current: Double
        /// `due` less what's been paid this period (0 if skipped).
        public let owed: Double
        /// The statement balance — what the issuer actually billed — or nil
        /// when the row already accounts for it.
        ///
        /// Once `due` became the period's goal, the statement had nowhere left
        /// to go whenever the goal isn't the balance: the minimum policy, a
        /// promo card, a per-card override. It's nil when it would only repeat
        /// `due` or `current`, and on loans, which have a principal rather
        /// than a statement. Deciding it here keeps the three clients from
        /// drifting.
        public let statement: Double?

        public init(due: Double, current: Double, owed: Double, statement: Double? = nil) {
            self.due = due
            self.current = current
            self.owed = owed
            self.statement = statement
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
        // One goal behind both figures: the target this period, and what's
        // left of it. Resolved together so they can't disagree.
        let goal = goalAmount(card: card, policy: policy, payments: payments, in: bounds, tz: tz, now: now)
        let owed = isSkipped(payments, type: "card", refId: ref, in: bounds)
            ? 0
            : remainingForGoal(type: "card", refId: ref, goal: goal, payments: payments, in: bounds)
        let current = liveBalance(card)
        let redundant = (card.type ?? "card") == "loan"
            || abs(card.balance - goal) <= paidEpsilon
            || abs(card.balance - current) <= paidEpsilon
        return CardAmounts(
            due: goal,
            current: current,
            owed: owed,
            statement: redundant ? nil : card.balance
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
        if (card.type ?? "card") == "loan" { return card.minPaymentOrZero }
        if card.hasPromo { return max(card.minPaymentOrZero, promoNeeded(card, tz: tz, now: now)) }
        // 0% interest (no active promo): carrying a balance costs nothing, so the
        // recommended payment is just the minimum — not the whole balance.
        if card.regularAPR <= 0 { return card.minPaymentOrZero }
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
            return card.minPaymentOrZero
        case .monthly:
            if let override = card.recommendedPayment, override > 0 { return override }
            return card.minPaymentOrZero
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
    public static func goalAmount(bill: Bill) -> Double { bill.amountOrZero }

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

    // MARK: - Paid state

    /// True when a bill has no amount to measure against: the field was never
    /// filled in (nil, not an explicit 0) and nothing has been paid toward it.
    ///
    /// This has to be separate from "fully paid", because a zero goal satisfies
    /// `remaining <= 0` on its own: a bill saved without an amount read "Paid
    /// this month" every month with no payment record behind it, and the row's
    /// Unmark had nothing to remove (it deletes a payment record), so the state
    /// couldn't be cleared from the UI at all. Mirrors needsAmount in utils.js.
    ///
    /// A skipped item is excluded — it owes nothing by choice, which is an
    /// answer rather than a missing one.
    public static func needsAmount(bill: Bill, payments: [Payment], in bounds: PeriodBounds) -> Bool {
        let ref = String(bill.id)
        if isSkipped(payments, type: "bill", refId: ref, in: bounds) { return false }
        if paidAmount(payments, type: "bill", refId: ref, in: bounds) > paidEpsilon { return false }
        return bill.amount == nil
    }

    /// True when a card/loan has no amount to measure against. Only the field
    /// the active goal actually reads counts: a balance-derived goal (the
    /// recommended / full policies on a credit card) legitimately reaches 0 once
    /// the card is paid off, which is "nothing due" rather than missing setup.
    public static func needsAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: [Payment],
        in bounds: PeriodBounds
    ) -> Bool {
        let ref = String(card.id)
        if isSkipped(payments, type: "card", refId: ref, in: bounds) { return false }
        if paidAmount(payments, type: "card", refId: ref, in: bounds) > paidEpsilon { return false }
        if (card.type ?? "card") == "loan" {
            // An override only drives the goal while it is above zero (see
            // PayTarget.monthly); otherwise the scheduled payment does.
            if (card.recommendedPayment ?? 0) > 0 { return false }
            return card.minPayment == nil
        }
        return policy == .minimum && card.minPayment == nil
    }

    /// True once nothing remains toward `goal`. An item with no amount set is
    /// never "paid" — see `needsAmount`. Mirrors isFullyPaid in utils.js.
    public static func isFullyPaid(goal: Double, paid: Double, skipped: Bool, needsAmount: Bool) -> Bool {
        if needsAmount { return false }
        if skipped { return true }
        return max(0, goal - paid) <= paidEpsilon
    }

    /// True when an item is settled because there is genuinely nothing to pay —
    /// an amount deliberately set to 0 — rather than because a payment was
    /// recorded. Lets a row say "Nothing due" instead of claiming credit for a
    /// payment that never happened. Mirrors nothingDue in utils.js.
    public static func nothingDue(goal: Double, paid: Double, skipped: Bool, needsAmount: Bool) -> Bool {
        if skipped || needsAmount { return false }
        return paid <= paidEpsilon && isFullyPaid(goal: goal, paid: paid, skipped: false, needsAmount: false)
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
