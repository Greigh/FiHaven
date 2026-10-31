import Foundation

public enum PayoffStrategy: String, Sendable, CaseIterable {
    case none       // pay minimums only
    case snowball   // extra → smallest balance first
    case avalanche  // extra → highest APR first
}

public struct PayoffCardResult: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var origBalance: Double
    public var paidOffMonth: Int?
    public var interestPaid: Double
    /// Balance left when the projection stopped — nonzero only for cards
    /// that hit the 360-month cap unpaid.
    public var endBalance: Double
    /// True only when the minimum payment cannot cover a month's interest
    /// at the balance the projection stopped at, outside any promo window —
    /// minimums provably never clear it. A card that is still declining when
    /// the projection runs out of months is incomplete, not impossible:
    /// "$10,000 at 0% on $25/mo" needs 400 months, but it clears.
    public var nonAmortizing: Bool
}

public struct PayoffResult: Equatable, Sendable {
    public var months: Int
    public var totalInterest: Double
    public var cards: [PayoffCardResult]
    public var payoffDate: Date

    /// Every card reached zero inside the projection. When false, months and
    /// totalInterest describe a run that stopped at the 360-month cap — fine
    /// to display, meaningless to compare against another sim's totals.
    public var finished: Bool { cards.allSatisfy { $0.paidOffMonth != nil } }
}

/// Month-by-month debt-payoff simulation, ported verbatim from
/// payoff.js `runPayoffSim`. Interest accrues monthly per promo bucket
/// (each promo's share at its own rate until its own end date; the
/// uncovered remainder at `regularAPR/100/12`); freed minimums roll into
/// the extra pool (the snowball rollover). Capped at 360 months.
///
/// Returns nil when no card carries a balance.
public enum Payoff {
    /// A promo's share of the card balance accruing at the promo rate until
    /// its own end date; the uncovered remainder rides at the regular APR.
    private struct PromoBucket {
        var bal: Double
        var rate: Double   // monthly
        var end: Date?
    }

    private struct Sim {
        var id: String
        var name: String
        var balance: Double
        var origBalance: Double
        var minPayment: Double
        var apr: Double
        var monthlyRate: Double
        /// Earliest-ending first — the order payments elsewhere drain them.
        var promoBuckets: [PromoBucket]
        var paidOffMonth: Int?
        var interestPaid: Double
        var housing: Bool
        /// Whether the card sat inside a promo window in the most recent
        /// month simulated — at the cap, promo interest suppression is what
        /// keeps a small minimum ahead of a large balance.
        var inPromoNow: Bool = false
    }

    /// Which strategy costs less interest. nil unless both sims finished —
    /// a capped sim's totalInterest is interest accrued inside a truncated
    /// projection, and comparing it to a finished run can crown the worse
    /// plan as "best".
    public static func recommendedStrategy(snowball: PayoffResult?, avalanche: PayoffResult?) -> PayoffStrategy? {
        guard let s = snowball, let a = avalanche, s.finished, a.finished else { return nil }
        return a.totalInterest <= s.totalInterest ? .avalanche : .snowball
    }

    /// Mortgage / home-equity style loans — PMI & escrow make sims approximate.
    public static func isHousingLoan(_ c: Card) -> Bool {
        guard (c.type ?? "card") == "loan" else { return false }
        let hay = [c.name, c.issuer ?? ""]
            .joined(separator: " ")
            .lowercased()
        let patterns = ["mortgage", "home equity", "heloc", "housing", "home loan", "refinance", "refi"]
        return patterns.contains { hay.contains($0) }
    }

    public static func runPayoffSim(
        cards: [Card],
        strategy: PayoffStrategy,
        extra: Double,
        tz: TimeZone,
        now: Date = Date(),
        includeMortgage: Bool = false
    ) -> PayoffResult? {
        // Prefer live Current Balance when set (matches web/Android payoff.js).
        func debtOf(_ c: Card) -> Double {
            if let cur = c.currentBalance, cur > 0 { return cur }
            return c.balance
        }
        let debtCards = cards.filter { debtOf($0) > 0 && (includeMortgage || !isHousingLoan($0)) }
        guard !debtCards.isEmpty else { return nil }

        var sim = debtCards.map { c in
            let starting = debtOf(c)
            let isLoan = (c.type ?? "card") == "loan"
            return Sim(
                id: c.id,
                name: c.name,
                balance: starting,
                origBalance: starting,
                minPayment: max(c.minPaymentOrZero, 1),
                apr: c.regularAPR,
                monthlyRate: c.regularAPR / 100 / 12,
                promoBuckets: isLoan ? [] : c.promoList
                    .sorted { ($0.endDate ?? "9999") < ($1.endDate ?? "9999") }
                    .map { PromoBucket(
                        bal: c.promoBalanceOf($0),
                        rate: $0.apr / 100 / 12,
                        end: DateLogic.parseDate($0.endDate, tz: tz)
                    ) },
                paidOffMonth: nil,
                interestPaid: 0,
                housing: isHousingLoan(c)
            )
        }

        switch strategy {
        case .snowball: sim.sort { $0.origBalance < $1.origBalance }
        case .avalanche: sim.sort { $0.apr > $1.apr }
        case .none: break
        }

        let cal = DateLogic.calendar(tz: tz)
        let nowComps = cal.dateComponents([.year, .month], from: now)
        let baseYear = nowComps.year ?? 0
        let baseMonth = nowComps.month ?? 1

        var month = 0
        var totalInterest = 0.0
        var extraPool = extra

        while sim.contains(where: { $0.balance > 0.01 }) && month < 360 {
            month += 1
            let targetDate = DateLogic.dateForDay(1, year: baseYear, month: baseMonth + month, cal: cal)

            // Accrue interest per bucket: an active promo's share at the
            // promo rate, an expired promo's share and the uncovered
            // remainder at the regular rate. Buckets gate on the live
            // balance, so paying the card down shrinks covered dollars first.
            for i in sim.indices {
                guard sim[i].balance > 0.01 else { continue }
                var remaining = sim[i].balance
                var interest = 0.0
                var inPromo = false
                for b in sim[i].promoBuckets {
                    let covered = min(b.bal, max(0, remaining))
                    remaining -= covered
                    let active = b.end.map { $0 >= targetDate } ?? false
                    if active { inPromo = true }
                    interest += covered * (active ? b.rate : sim[i].monthlyRate)
                }
                if remaining > 0 { interest += remaining * sim[i].monthlyRate }
                sim[i].inPromoNow = inPromo
                if interest > 0 {
                    sim[i].interestPaid += interest
                    totalInterest += interest
                    sim[i].balance += interest
                }
            }

            // Pay each minimum.
            var freedThisMonth = 0.0
            for i in sim.indices {
                guard sim[i].balance > 0.01 else { continue }
                let pay = min(sim[i].balance, sim[i].minPayment)
                sim[i].balance -= pay
                if sim[i].balance < 0.01 {
                    sim[i].balance = 0
                    if sim[i].paidOffMonth == nil {
                        sim[i].paidOffMonth = month
                        freedThisMonth += sim[i].minPayment
                    }
                }
            }

            // Apply the extra pool down the sorted list.
            if strategy != .none && extraPool > 0.01 {
                var remaining = extraPool
                for i in sim.indices {
                    if remaining <= 0.01 { break }
                    guard sim[i].balance > 0.01 else { continue }
                    let pay = min(sim[i].balance, remaining)
                    sim[i].balance -= pay
                    remaining -= pay
                    if sim[i].balance < 0.01 {
                        sim[i].balance = 0
                        if sim[i].paidOffMonth == nil {
                            sim[i].paidOffMonth = month
                            freedThisMonth += sim[i].minPayment
                        }
                    }
                }
            }

            extraPool += freedThisMonth
        }

        return PayoffResult(
            months: month,
            totalInterest: (totalInterest * 100).rounded() / 100,
            cards: sim.map { c in
                PayoffCardResult(
                    id: c.id,
                    name: c.name,
                    origBalance: c.origBalance,
                    paidOffMonth: c.paidOffMonth,
                    interestPaid: c.interestPaid,
                    endBalance: c.balance,
                    // Non-amortizing: the month's interest outruns the minimum,
                    // so the balance can never decline. A promo still running
                    // at the cap keeps even a tiny payment ahead, and a balance
                    // that fell this month would eventually reach zero — both
                    // are "ran out of projection", not "never clears".
                    nonAmortizing: c.paidOffMonth == nil
                        && !c.inPromoNow
                        && c.minPayment <= c.balance * c.monthlyRate
                )
            },
            payoffDate: DateLogic.dateForDay(1, year: baseYear, month: baseMonth + month, cal: cal)
        )
    }
}
