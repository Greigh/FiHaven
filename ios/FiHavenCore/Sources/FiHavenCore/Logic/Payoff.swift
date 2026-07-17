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
}

public struct PayoffResult: Equatable, Sendable {
    public var months: Int
    public var totalInterest: Double
    public var cards: [PayoffCardResult]
    public var payoffDate: Date
}

/// Month-by-month debt-payoff simulation, ported verbatim from
/// payoff.js `runPayoffSim`. Interest accrues monthly
/// (`regularAPR/100/12`) and is skipped while a card is inside its 0%
/// promo window; freed minimums roll into the extra pool (the snowball
/// rollover). Capped at 360 months.
///
/// Returns nil when no card carries a balance.
public enum Payoff {
    private struct Sim {
        var id: String
        var name: String
        var balance: Double
        var origBalance: Double
        var minPayment: Double
        var apr: Double
        var monthlyRate: Double
        var hasPromo: Bool
        var promoEnd: Date?
        var paidOffMonth: Int?
        var interestPaid: Double
        var housing: Bool
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
                minPayment: max(c.minPayment, 1),
                apr: c.regularAPR,
                monthlyRate: c.regularAPR / 100 / 12,
                hasPromo: isLoan ? false : c.hasPromo,
                promoEnd: isLoan ? nil : DateLogic.parseDate(c.promoEndDate, tz: tz),
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

            // Accrue interest (skipped inside a promo window).
            for i in sim.indices {
                guard sim[i].balance > 0.01 else { continue }
                let inPromo = sim[i].hasPromo
                    && (sim[i].promoEnd.map { $0 >= targetDate } ?? false)
                if !inPromo && sim[i].monthlyRate > 0 {
                    let interest = sim[i].balance * sim[i].monthlyRate
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
            cards: sim.map {
                PayoffCardResult(
                    id: $0.id,
                    name: $0.name,
                    origBalance: $0.origBalance,
                    paidOffMonth: $0.paidOffMonth,
                    interestPaid: $0.interestPaid
                )
            },
            payoffDate: DateLogic.dateForDay(1, year: baseYear, month: baseMonth + month, cal: cal)
        )
    }
}
