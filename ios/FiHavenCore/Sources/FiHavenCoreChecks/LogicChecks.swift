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
        let jun29 = Calendar.current.date(from: DateComponents(year: 2026, month: 6, day: 29))!
        check(DateLogic.daysUntilDue(dueDay: 28, tz: tz, now: jun29) < 0, "unpaid past due is negative")
        check(DateLogic.effectiveDaysUntilDue(dueDay: 28, whenFullyPaid: true, tz: tz, now: jun29) > 20,
              "paid skips overdue for current cycle")
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

    section("BillSchedule — periodNoun") {
        checkEqual(BillSchedule.periodNoun("Monthly"), "month", "monthly → month")
        checkEqual(BillSchedule.periodNoun("Quarterly"), "quarter", "quarterly → quarter")
        checkEqual(BillSchedule.periodNoun("Annually"), "year", "annually → year")
        checkEqual(BillSchedule.periodNoun("Weekly"), "week", "weekly → week")
        checkEqual(BillSchedule.periodNoun("Bi-weekly"), "cycle", "bi-weekly → cycle")
        checkEqual(BillSchedule.periodNoun("nonsense"), "month", "unknown → month")
    }

    section("Schedule — promoNeeded") {
        let c = Card(id: "10", name: "Chase", balance: 2340, hasPromo: true,
                     promoEndDate: "2026-10-01", promoBalance: 2340)
        checkClose(Schedule.promoNeeded(c, tz: tz, now: now), 585, "2340 / 4 months", tol: 0.001)

        let fallback = Card(id: "1", name: "X", balance: 1000, hasPromo: true,
                            promoEndDate: "2026-10-01", promoBalance: 0)
        checkClose(Schedule.promoNeeded(fallback, tz: tz, now: now), 250, "0 promoBalance → use balance", tol: 0.001)

        let expired = Card(id: "1", name: "X", balance: 800, hasPromo: true,
                           promoEndDate: "2025-01-01", promoBalance: 800)
        checkClose(Schedule.promoNeeded(expired, tz: tz, now: now), 800, "expired → whole balance")
    }

    section("Schedule — buildUpcomingItems") {
        let bills = [
            Bill(id: "1", name: "Late", amount: 50, dueDay: 20),
            Bill(id: "2", name: "Rolled", amount: 30, dueDay: 10),
        ]
        let items = Schedule.buildUpcomingItems(bills: bills, cards: [], tz: tz, now: now)
        checkEqual(items.map(\.refId), ["1", "2"], "sorted soonest-first")
        checkEqual(items[0].days, 5, "first item days")
        checkEqual(items[1].days, 25, "second item days")
        checkEqual(items[0].icon, "📌", "bill category Other → 📌")

        let cards = [Card(id: "10", name: "Chase", balance: 2340, minPayment: 35,
                          hasPromo: true, promoEndDate: "2026-10-01",
                          promoBalance: 2340, dueDay: 18)]
        let cardItems = Schedule.buildUpcomingItems(bills: [], cards: cards, tz: tz, now: now)
        checkEqual(cardItems.count, 1, "one card item")
        checkClose(cardItems[0].amount, 585, "max(min 35, promoNeeded 585)", tol: 0.001)
        checkEqual(cardItems[0].name, "Chase (payment)", "card item name")

        let noDue = Schedule.buildUpcomingItems(
            bills: [Bill(id: "1", name: "NoDue", amount: 10, dueDay: nil)], cards: [], tz: tz, now: now)
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
        let card = Card(id: "1", name: "Reg", balance: 2000, minPayment: 50, regularAPR: 24)
        checkClose(Schedule.recommendedAmount(card, tz: tz), 2000, "interest-bearing non-promo recommended = full balance", tol: 0.001)
        var override = card; override.recommendedPayment = 300
        checkClose(Schedule.recommendedAmount(override, tz: tz), 300, "override wins", tol: 0.001)

        // A 0% card has no interest cost to carry, so recommended/owed = minimum.
        let zeroApr = Card(id: "2", name: "0%", balance: 2000, minPayment: 50, regularAPR: 0)
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
        var loan = Card(id: "9", name: "Mortgage", balance: 250_000, minPayment: 1600)
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
        let flat = Card(id: "1", name: "Flat 2%", rewardBase: 2)
        let dining = Card(id: "2", name: "Dining 4%", rewardBase: 1, rewardCategories: ["Dining": 4])
        var promo = Card(id: "3", name: "Promo 5%", rewardBase: 5)
        promo.hasPromo = true; promo.promoEndDate = "2026-12-31"
        let loan = Card(id: "4", name: "Loan", rewardBase: 9); var l = loan; l.type = "loan"

        let r = Rewards.rank([flat, dining, promo, l], category: "Dining", tz: tz, now: now)
        check(r.eligible.first?.card.id == "2", "dining 4% wins over flat 2%")
        check(!r.eligible.contains { $0.card.id == "4" }, "loan excluded entirely")
        check(r.excluded.contains { $0.card.id == "3" }, "active 0% promo card excluded with reason")
        check(!r.eligible.contains { $0.card.id == "3" }, "promo card not in eligible")

        // Same cards for Groceries → dining card falls back to its 1% base.
        let g = Rewards.rank([flat, dining], category: "Groceries", tz: tz, now: now)
        check(g.eligible.first?.card.id == "1", "flat 2% wins groceries (dining card uses 1% base)")

        // Explanation strings.
        checkEqual(Rewards.explanation(dining, category: "Dining"), "4% back on dining", "bonus explanation")
        checkEqual(Rewards.explanation(dining, category: "Gas"), "1% back on everything", "base explanation")
        let bilt = Card(id: "5", name: "Bilt", rewardBase: 1, rewardCategories: ["Dining": 3], pointValue: 2)
        checkEqual(Rewards.explanation(bilt, category: "Dining"), "3× points · 2¢/pt = 6% back on dining", "points explanation")
        checkEqual(Rewards.explanation(Card(id: "6", name: "None"), category: "Gas"), "No reward rate set", "no-rate explanation")

        // Wallet strategy picks the best per category, nil when none earn.
        let wallet = Rewards.walletStrategy([flat, dining], categories: ["Dining", "Gas"], tz: tz, now: now)
        checkEqual(wallet.first { $0.category == "Dining" }?.best?.card.id, "2", "dining best is the 4% card")
        checkEqual(wallet.first { $0.category == "Gas" }?.best?.card.id, "1", "gas best is the flat 2%")
        check(Rewards.walletStrategy([Card(id: "7", name: "Z")], categories: ["Gas"], tz: tz, now: now).first?.best == nil,
              "no earning card → nil best")
    }

    section("Offers — active, expiry, soon") {
        let tz = TimeZone(identifier: "UTC")!
        let now = makeDate(2026, 6, 20, tz: tz)
        let card = Card(id: "1", name: "Amex", offers: [
            CardOffer(id: "a", merchant: "Whole Foods", detail: "10% back", expires: "2026-06-28"),
            CardOffer(id: "b", merchant: "Uber", detail: "$5", expires: "2026-06-22"),
            CardOffer(id: "used", merchant: "Used", expires: "2026-06-21", used: true),
            CardOffer(id: "gone", merchant: "Expired", expires: "2026-06-01"),
            CardOffer(id: "noexp", merchant: "Forever", expires: ""),
        ])
        checkEqual(Offers.daysLeft(card.offers[0], tz: tz, now: now), 8, "8 days left")
        check(Offers.expired(card.offers[3], tz: tz, now: now), "past date is expired")
        check(!Offers.expired(card.offers[4], tz: tz, now: now), "no-expiry is not expired")

        let active = Offers.active([card], tz: tz, now: now)
        checkEqual(active.map { $0.offer.id }, ["b", "a", "noexp"], "active sorted, used/expired dropped")
        checkEqual(Offers.expiringSoon([card], tz: tz, now: now), 1, "one expiring within 7 days")
    }

    section("Merchants — category hints") {
        checkEqual(Merchants.category("STARBUCKS #1234"), "Dining", "starbucks → Dining")
        checkEqual(Merchants.category("Whole Foods Market"), "Groceries", "whole foods → Groceries")
        checkEqual(Merchants.category("Shell Oil 5567"), "Gas", "shell → Gas")
        checkEqual(Merchants.category("Netflix.com"), "Streaming", "netflix → Streaming")
        checkEqual(Merchants.category("Amazon Marketplace"), "Online shopping", "amazon → Online shopping")
        check(Merchants.category("Joe's Hardware Emporium") == nil, "unknown merchant → nil")
        check(Merchants.category("") == nil, "empty → nil")
        // Only ever returns a valid reward category.
        let valid = Set(Rewards.categories)
        check(Merchants.hints.allSatisfy { valid.contains($0.1) }, "all hints map to reward categories")
    }

    section("Rewards — spend categorization & estimate") {
        let tz = TimeZone(identifier: "UTC")!
        let now = makeDate(2026, 6, 20, tz: tz)
        checkEqual(Rewards.txRewardCategory(SpendTransaction(id: "1", category: "Whatever", merchant: "Starbucks")), "Dining", "merchant hint wins")
        checkEqual(Rewards.txRewardCategory(SpendTransaction(id: "2", category: "Groceries", merchant: "Unknown Shop")), "Groceries", "falls back to tx category")
        checkEqual(Rewards.txRewardCategory(SpendTransaction(id: "3", category: "NotACategory", merchant: "Unknown Shop")), "Other", "else Other")

        // ~170 days of data → factor ~2.15.
        let txns = [
            SpendTransaction(id: "a", date: "2026-06-10", amount: 50, merchant: "Starbucks"),
            SpendTransaction(id: "b", date: "2026-01-01", amount: 50, merchant: "Chipotle"),
            SpendTransaction(id: "c", date: "2026-01-01", amount: 100, category: "Gas", merchant: "Some Station"),
            SpendTransaction(id: "d", date: "2026-06-15", amount: -20, merchant: "refund"), // inflow ignored
        ]
        let spend = Rewards.categorySpendAnnual(txns, tz: tz, now: now)
        check((spend["Dining"] ?? 0) > 180, "dining annualized above raw")
        check((spend["Gas"] ?? 0) > 180, "gas annualized above raw")
        check(Rewards.categorySpendAnnual([], tz: tz, now: now).isEmpty, "no txns → empty")

        // Rewards estimate counts only bonus categories.
        let est = ["Dining": 1000.0, "Gas": 1000.0, "Other": 5000.0]
        checkClose(Rewards.cardRewardsEstimateAnnual(Card(id: "1", name: "Gold", rewardBase: 1, rewardCategories: ["Dining": 4]), spendByCategory: est), 40, "4% on $1000 dining = $40")
        checkClose(Rewards.cardRewardsEstimateAnnual(Card(id: "2", name: "Pts", rewardBase: 1, rewardCategories: ["Dining": 3], pointValue: 2), spendByCategory: est), 60, "3×2¢ = 6% → $60")
        var loan = Card(id: "3", name: "Loan", rewardCategories: ["Dining": 4]); loan.type = "loan"
        checkClose(Rewards.cardRewardsEstimateAnnual(loan, spendByCategory: est), 0, "loans earn nothing")
    }

    section("Offers — use suggestions from transactions") {
        let tz = TimeZone(identifier: "UTC")!
        let now = makeDate(2026, 6, 20, tz: tz)
        let card = Card(id: "1", name: "Amex", offers: [
            CardOffer(id: "match", merchant: "Best Buy", expires: "2026-06-30"),
            CardOffer(id: "used", merchant: "Best Buy", expires: "2026-06-30", used: true),
            CardOffer(id: "expired", merchant: "Best Buy", expires: "2026-06-01"),
        ])
        let txns = [
            SpendTransaction(id: "t1", date: "2026-06-12", amount: 200, merchant: "BEST BUY #14"),
            SpendTransaction(id: "t2", date: "2026-06-15", amount: 300, merchant: "BEST BUY ONLINE"), // newer
        ]
        let tx = Offers.likelyUsedTx(card.offers[0], transactions: txns, tz: tz, now: now)
        checkEqual(tx?.id, "t2", "most recent matching charge wins")
        let sugg = Offers.useSuggestions([card], transactions: txns, tz: tz, now: now)
        checkEqual(sugg.map { $0.offer.id }, ["match"], "used/expired offers excluded from suggestions")
    }

    section("Reconcile — bank vs manual") {
        let tz = TimeZone(identifier: "UTC")!
        let now = makeDate(2026, 6, 20, tz: tz)
        func tx(_ id: String, _ date: String, _ amount: Double, _ merchant: String, _ source: String = "manual") -> SpendTransaction {
            SpendTransaction(id: id, date: date, amount: amount, merchant: merchant, source: source)
        }
        // looksSame: amount=, merchant~, date ±1.
        check(Reconcile.looksSame(tx("a", "2026-06-15", 42.5, "Starbucks #12"),
                                  tx("b", "2026-06-16", 42.5, "STARBUCKS", "plaid"), tz: tz), "same purchase ±1 day")
        check(!Reconcile.looksSame(tx("a", "2026-06-15", 42.5, "Starbucks"),
                                   tx("b", "2026-06-20", 42.5, "Starbucks", "plaid"), tz: tz), "far date is not the same")
        check(!Reconcile.looksSame(tx("a", "2026-06-15", 42.5, "Starbucks"),
                                   tx("b", "2026-06-15", 9.0, "Starbucks", "plaid"), tz: tz), "different amount is not the same")

        let txns = [
            tx("m1", "2026-06-15", 42.5, "Starbucks"),
            tx("m2", "2026-06-18", 80, "Costco"),
            tx("p1", "2026-06-16", 42.5, "STARBUCKS #9", "plaid"),
            tx("p2", "2026-06-14", 23.1, "Shell Oil", "plaid"),
        ]
        let pairs = Reconcile.duplicatePairs(txns, tz: tz)
        checkEqual(pairs.count, 1, "one duplicate pair")
        checkEqual(pairs.first?.manual.id, "m1", "manual side m1")
        checkEqual(pairs.first?.bank.id, "p1", "bank side p1")
        checkEqual(Reconcile.unmatchedBank(txns, tz: tz).map { $0.id }, ["p2"], "p2 has no manual match")
        checkEqual(Reconcile.unconfirmedManual(txns, tz: tz, now: now).map { $0.id }, ["m2"], "m2 uncorroborated by bank")
    }
}

func runPayoffChecks() {
    let tz = utcTZ
    let now = makeDate(2026, 6, 15, tz: tz)

    section("Payoff — simulation") {
        check(Payoff.runPayoffSim(cards: [Card(id: "1", name: "Paid", balance: 0)],
                                  strategy: .avalanche, extra: 0, tz: tz, now: now) == nil,
              "no debt → nil")

        let zero = Payoff.runPayoffSim(
            cards: [Card(id: "1", name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        checkEqual(zero.months, 10, "0% / $100 min → 10 months")
        checkClose(zero.totalInterest, 0, "no interest at 0%")
        checkEqual(zero.cards[0].paidOffMonth, 10, "paid off month 10")
        checkEqual(DateLogic.monthKey(zero.payoffDate, tz: tz), "2027-04", "payoff date Apr 2027")

        let ignoreExtra = Payoff.runPayoffSim(
            cards: [Card(id: "1", name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .none, extra: 1000, tz: tz, now: now)!
        checkEqual(ignoreExtra.months, 10, "none strategy ignores extra")

        let withExtra = Payoff.runPayoffSim(
            cards: [Card(id: "1", name: "A", balance: 1000, minPayment: 100, regularAPR: 0)],
            strategy: .avalanche, extra: 100, tz: tz, now: now)!
        checkEqual(withExtra.months, 5, "$200/mo → 5 months")

        let interest = Payoff.runPayoffSim(
            cards: [Card(id: "1", name: "A", balance: 1000, minPayment: 100, regularAPR: 24)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        check(interest.totalInterest > 0, "interest accrues on a regular card")
        check(interest.months > 10, "interest stretches payoff past 10 months")

        let reg = Payoff.runPayoffSim(
            cards: [Card(id: "1", name: "Reg", balance: 2000, minPayment: 50, regularAPR: 25)],
            strategy: .none, extra: 0, tz: tz, now: now)!
        let promo = Payoff.runPayoffSim(
            cards: [Card(id: "2", name: "Promo", balance: 2000, minPayment: 50, regularAPR: 25,
                         hasPromo: true, promoEndDate: "2030-01-01")],
            strategy: .none, extra: 0, tz: tz, now: now)!
        check(reg.totalInterest > promo.totalInterest, "promo suppresses interest while active")

        let snow = Payoff.runPayoffSim(
            cards: [
                Card(id: "1", name: "Big", balance: 3000, minPayment: 50, regularAPR: 0),
                Card(id: "2", name: "Small", balance: 500, minPayment: 50, regularAPR: 0),
            ],
            strategy: .snowball, extra: 200, tz: tz, now: now)!
        let small = snow.cards.first { $0.id == "2" }!
        let big = snow.cards.first { $0.id == "1" }!
        check(small.paidOffMonth != nil && big.paidOffMonth != nil, "both cards pay off")
        check(small.paidOffMonth! <= big.paidOffMonth!, "snowball clears smallest first")
    }
}
