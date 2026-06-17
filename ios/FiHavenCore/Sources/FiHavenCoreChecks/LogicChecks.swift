import Foundation
import FiHavenCore

func runIncomeChecks() {
    section("Income — frequency factors") {
        checkClose(Income.factor(for: "weekly"), 52.0 / 12.0, "weekly")
        checkClose(Income.factor(for: "biweekly"), 26.0 / 12.0, "biweekly")
        checkClose(Income.factor(for: "semimonthly"), 2, "semimonthly")
        checkClose(Income.factor(for: "monthly"), 1, "monthly")
        checkClose(Income.factor(for: "annual"), 1.0 / 12.0, "annual")
        checkClose(Income.factor(for: "nonsense"), 1, "unknown → monthly")
    }

    section("Income — monthly totals") {
        var s = Settings()
        s.incomes = [IncomeSource(id: "a", label: "Pay", amount: 2080, frequency: "biweekly")]
        checkClose(Income.monthlyIncome(from: s), 4506.6667, "biweekly 2080 → ~4506.67", tol: 0.001)

        var legacy = Settings()
        legacy.income = 3200
        checkClose(Income.monthlyIncome(from: legacy), 3200, "legacy fallback")

        var both = Settings()
        both.income = 9999
        both.incomes = [IncomeSource(id: "a", label: "Pay", amount: 1000, frequency: "monthly")]
        checkClose(Income.monthlyIncome(from: both), 1000, "sources beat legacy field")
    }
}

func runDateLogicChecks() {
    let tz = utcTZ
    let now = makeDate(2026, 6, 15, tz: tz)  // 2026-06-15

    section("DateLogic — monthKey") {
        checkEqual(DateLogic.monthKey(now, tz: tz), "2026-06", "monthKey")
        checkEqual(DateLogic.monthKey(makeDate(2026, 1, 3, tz: tz), tz: tz), "2026-01", "Jan padded")
    }

    section("DateLogic — daysUntilDue") {
        checkEqual(DateLogic.daysUntilDue(dueDay: 20, tz: tz, now: now), 5, "later this month")
        checkEqual(DateLogic.daysUntilDue(dueDay: 15, tz: tz, now: now), 0, "today")
        checkEqual(DateLogic.daysUntilDue(dueDay: 14, tz: tz, now: now), -1, "yesterday stays -1")
        checkEqual(DateLogic.daysUntilDue(dueDay: 10, tz: tz, now: now), 25, "rolls to next month")
    }

    section("DateLogic — nextDueDate") {
        let n20 = DateLogic.nextDueDate(dueDay: 20, tz: tz, now: now)!
        checkEqual(DateLogic.monthKey(n20, tz: tz), "2026-06", "next 20th this month")
        let n10 = DateLogic.nextDueDate(dueDay: 10, tz: tz, now: now)!
        checkEqual(DateLogic.monthKey(n10, tz: tz), "2026-07", "next 10th next month")
    }

    section("DateLogic — monthsUntil / labels / tz") {
        checkEqual(DateLogic.monthsUntil("2026-10-01", tz: tz, now: now), 4, "4 months out")
        checkEqual(DateLogic.monthsUntil("2026-06-30", tz: tz, now: now), 0, "same month → 0")
        checkEqual(DateLogic.monthsUntil("2025-01-01", tz: tz, now: now), 0, "past floored to 0")
        checkEqual(DateLogic.monthsUntil(nil, tz: tz, now: now), 0, "nil → 0")
        checkEqual(DateLogic.monthKeyLabel("2026-06", tz: tz), "June 2026", "month label")
        checkEqual(DateLogic.resolveTimeZone("America/New_York").identifier, "America/New_York", "valid tz")
        checkEqual(DateLogic.resolveTimeZone("auto"), TimeZone.current, "auto → device")
        checkEqual(DateLogic.resolveTimeZone("Not/AZone"), TimeZone.current, "invalid → device")
    }
}

func runScheduleChecks() {
    let tz = utcTZ
    let now = makeDate(2026, 6, 15, tz: tz)

    section("Schedule — promoNeeded") {
        let c = Card(id: 10, name: "Chase", balance: 2340, hasPromo: true,
                     promoEndDate: "2026-10-01", promoBalance: 2340)
        checkClose(Schedule.promoNeeded(c, tz: tz, now: now), 585, "2340 / 4 months", tol: 0.001)

        let fallback = Card(id: 1, name: "X", balance: 1000, hasPromo: true,
                            promoEndDate: "2026-10-01", promoBalance: 0)
        checkClose(Schedule.promoNeeded(fallback, tz: tz, now: now), 250, "0 promoBalance → use balance", tol: 0.001)

        let expired = Card(id: 1, name: "X", balance: 800, hasPromo: true,
                           promoEndDate: "2025-01-01", promoBalance: 800)
        checkClose(Schedule.promoNeeded(expired, tz: tz, now: now), 800, "expired → whole balance")
    }

    section("Schedule — buildUpcomingItems") {
        let bills = [
            Bill(id: 1, name: "Late", amount: 50, dueDay: 20),
            Bill(id: 2, name: "Rolled", amount: 30, dueDay: 10),
        ]
        let items = Schedule.buildUpcomingItems(bills: bills, cards: [], tz: tz, now: now)
        checkEqual(items.map(\.refId), ["1", "2"], "sorted soonest-first")
        checkEqual(items[0].days, 5, "first item days")
        checkEqual(items[1].days, 25, "second item days")
        checkEqual(items[0].icon, "📌", "bill category Other → 📌")

        let cards = [Card(id: 10, name: "Chase", balance: 2340, minPayment: 35,
                          hasPromo: true, promoEndDate: "2026-10-01",
                          promoBalance: 2340, dueDay: 18)]
        let cardItems = Schedule.buildUpcomingItems(bills: [], cards: cards, tz: tz, now: now)
        checkEqual(cardItems.count, 1, "one card item")
        checkClose(cardItems[0].amount, 585, "max(min 35, promoNeeded 585)", tol: 0.001)
        checkEqual(cardItems[0].name, "Chase (payment)", "card item name")

        let noDue = Schedule.buildUpcomingItems(
            bills: [Bill(id: 1, name: "NoDue", amount: 10, dueDay: nil)], cards: [], tz: tz, now: now)
        check(noDue.isEmpty, "bill without dueDay skipped")
    }

    section("Schedule — isPaid / paidAmount") {
        let payments = [
            Payment(id: "1", type: "bill", refId: "1", amount: 100, monthKey: "2026-06"),
            Payment(id: "2", type: "bill", refId: "1", amount: 50, monthKey: "2026-06"),
            Payment(id: "3", type: "bill", refId: "1", amount: 999, monthKey: "2026-05"),
        ]
        check(Schedule.isPaid(payments, type: "bill", refId: "1", monthKey: "2026-06"), "isPaid true")
        check(!Schedule.isPaid(payments, type: "card", refId: "1", monthKey: "2026-06"), "wrong type not paid")
        checkClose(Schedule.paidAmount(payments, type: "bill", refId: "1", monthKey: "2026-06"), 150, "sum this month")
    }

    section("Schedule — recommendedAmount / goalAmount") {
        let tz = TimeZone(identifier: "UTC")!
        let card = Card(id: 1, name: "Reg", balance: 2000, minPayment: 50, regularAPR: 24)
        checkClose(Schedule.recommendedAmount(card, tz: tz), 2000, "interest-bearing non-promo recommended = full balance", tol: 0.001)
        var override = card; override.recommendedPayment = 300
        checkClose(Schedule.recommendedAmount(override, tz: tz), 300, "override wins", tol: 0.001)

        // A 0% card has no interest cost to carry, so recommended/owed = minimum.
        let zeroApr = Card(id: 2, name: "0%", balance: 2000, minPayment: 50, regularAPR: 0)
        checkClose(Schedule.recommendedAmount(zeroApr, tz: tz), 50, "0% card recommended = minimum", tol: 0.001)
        checkClose(Schedule.goalAmount(card: zeroApr, policy: .recommended, payments: [], monthKey: "2026-06", tz: tz),
                   50, "0% card recommended goal = minimum", tol: 0.001)
        checkClose(Schedule.goalAmount(card: zeroApr, policy: .full, payments: [], monthKey: "2026-06", tz: tz),
                   2000, "0% card full goal still = balance", tol: 0.001)

        let paid = [Payment(id: "1", type: "card", refId: "1", amount: 500, monthKey: "2026-06")]
        checkClose(Schedule.goalAmount(card: card, policy: .recommended, payments: paid, monthKey: "2026-06", tz: tz),
                   2500, "recommended goal stabilized to start-of-month balance", tol: 0.001)
        checkClose(Schedule.goalAmount(card: card, policy: .minimum, payments: paid, monthKey: "2026-06", tz: tz),
                   50, "minimum goal ignores balance", tol: 0.001)
        checkClose(Schedule.goalAmount(card: override, policy: .recommended, payments: paid, monthKey: "2026-06", tz: tz),
                   300, "override goal is the fixed value", tol: 0.001)

        // Loans recommend the scheduled monthly payment, never the principal.
        var loan = Card(id: 9, name: "Mortgage", balance: 250_000, minPayment: 1600)
        loan.type = "loan"
        checkClose(Schedule.recommendedAmount(loan, tz: tz), 1600, "loan recommended = monthly payment", tol: 0.001)
        checkClose(Schedule.goalAmount(card: loan, policy: .recommended, payments: [], monthKey: "2026-06", tz: tz),
                   1600, "loan goal = monthly under recommended", tol: 0.001)
        checkClose(Schedule.goalAmount(card: loan, policy: .full, payments: [], monthKey: "2026-06", tz: tz),
                   1600, "loan goal = monthly even under full", tol: 0.001)
    }

    section("Rewards — rank for category") {
        let tz = TimeZone(identifier: "UTC")!
        let now = makeDate(2026, 6, 15, tz: tz)
        let flat = Card(id: 1, name: "Flat 2%", rewardBase: 2)
        let dining = Card(id: 2, name: "Dining 4%", rewardBase: 1, rewardCategories: ["Dining": 4])
        var promo = Card(id: 3, name: "Promo 5%", rewardBase: 5)
        promo.hasPromo = true; promo.promoEndDate = "2026-12-31"
        let loan = Card(id: 4, name: "Loan", rewardBase: 9); var l = loan; l.type = "loan"

        let r = Rewards.rank([flat, dining, promo, l], category: "Dining", tz: tz, now: now)
        check(r.eligible.first?.card.id == 2, "dining 4% wins over flat 2%")
        check(!r.eligible.contains { $0.card.id == 4 }, "loan excluded entirely")
        check(r.excluded.contains { $0.card.id == 3 }, "active 0% promo card excluded with reason")
        check(!r.eligible.contains { $0.card.id == 3 }, "promo card not in eligible")

        // Same cards for Groceries → dining card falls back to its 1% base.
        let g = Rewards.rank([flat, dining], category: "Groceries", tz: tz, now: now)
        check(g.eligible.first?.card.id == 1, "flat 2% wins groceries (dining card uses 1% base)")
    }
}

func runPayoffChecks() {
    let tz = utcTZ
    let now = makeDate(2026, 6, 15, tz: tz)

    section("Payoff — simulation") {
        check(Payoff.runPayoffSim(cards: [Card(id: 1, name: "Paid", balance: 0)],
                                  strategy: .avalanche, extra: 0, tz: tz, now: now) == nil,
              "no debt → nil")

        let zero = Payoff.runPayoffSim(
            cards: [Card(id: 1, name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        checkEqual(zero.months, 10, "0% / $100 min → 10 months")
        checkClose(zero.totalInterest, 0, "no interest at 0%")
        checkEqual(zero.cards[0].paidOffMonth, 10, "paid off month 10")
        checkEqual(DateLogic.monthKey(zero.payoffDate, tz: tz), "2027-04", "payoff date Apr 2027")

        let ignoreExtra = Payoff.runPayoffSim(
            cards: [Card(id: 1, name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .none, extra: 1000, tz: tz, now: now)!
        checkEqual(ignoreExtra.months, 10, "none strategy ignores extra")

        let withExtra = Payoff.runPayoffSim(
            cards: [Card(id: 1, name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .avalanche, extra: 100, tz: tz, now: now)!
        checkEqual(withExtra.months, 5, "$200/mo → 5 months")

        let interest = Payoff.runPayoffSim(
            cards: [Card(id: 1, name: "A", balance: 1000, minPayment: 100, regularAPR: 24)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        check(interest.totalInterest > 0, "interest accrues on a regular card")
        check(interest.months > 10, "interest stretches payoff past 10 months")

        let reg = Payoff.runPayoffSim(
            cards: [Card(id: 1, name: "Reg", balance: 2000, minPayment: 50, regularAPR: 25)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        let promo = Payoff.runPayoffSim(
            cards: [Card(id: 2, name: "Promo", balance: 2000, minPayment: 50, regularAPR: 25,
                         hasPromo: true, promoEndDate: "2030-01-01")],
            strategy: .none, extra: 0, tz: tz, now: now)!
        check(reg.totalInterest > promo.totalInterest, "promo suppresses interest while active")

        let snow = Payoff.runPayoffSim(
            cards: [
                Card(id: 1, name: "Big", balance: 3000, minPayment: 50, regularAPR: 0),
                Card(id: 2, name: "Small", balance: 500, minPayment: 50, regularAPR: 0),
            ],
            strategy: .snowball, extra: 200, tz: tz, now: now)!
        let small = snow.cards.first { $0.id == 2 }!
        let big = snow.cards.first { $0.id == 1 }!
        check(small.paidOffMonth != nil && big.paidOffMonth != nil, "both cards pay off")
        check(small.paidOffMonth! <= big.paidOffMonth!, "snowball clears smallest first")
    }
}
