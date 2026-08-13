import Foundation
import FiHavenCore

/// Mirrors BudgetRulesTest.kt / SpendingInsightsTest.kt and their web
/// counterparts. Neither module had a single check on iOS before this file.
func runBudgetRulesChecks() {
    let tz = utcTZ
    let cfg = PeriodConfig(mode: "calendar", length: 35)
    let june = Period.bounds(for: makeDate(2026, 6, 1, tz: tz), config: cfg, tz: tz)

    func settings(_ pairs: [String: JSONValue]) -> Settings {
        var s = Settings()
        for (k, v) in pairs { s.raw[k] = v }
        return s
    }

    section("BudgetRules — mode and splits") {
        checkEqual(BudgetRules.mode(from: Settings()), "off", "no rule → off")
        let rule = settings(["budgetRule": .string("50-30-20")])
        checkEqual(BudgetRules.mode(from: rule), "50-30-20", "the split rule is recognized")
        checkEqual(BudgetRules.splits(from: rule)?.needs, 50, "50/30/20 needs share")
        let preset = settings(["budgetRule": .string("80-20")])
        checkEqual(BudgetRules.splits(from: preset)?.needs, 80, "80/20 needs share")
        check(BudgetRules.splits(from: Settings()) == nil, "no rule has no splits")
    }

    section("BudgetRules — obligations-first lens") {
        let s = settings(["budgetRule": .string("obligations-first")])
        let lens = BudgetRules.lens(
            settings: s, income: 5000,
            bills: [Bill(id: "1", name: "Rent", category: "Housing", amount: 1500)],
            cards: [Card(id: "1", name: "Visa", balance: 0, minPayment: 100)],
            transactions: [], goals: [], bounds: june,
            billDueInPeriod: { _ in true }, isPro: false, tz: tz
        )
        check(lens != nil, "a lens is produced")
        checkEqual(lens?.headline?.label, "Safe to spend", "the headline names what's left")
    }

    section("BudgetRules — split lens and bucket overrides") {
        let s = settings(["budgetRule": .string("50-30-20")])
        let lens = BudgetRules.lens(
            settings: s, income: 4000,
            bills: [Bill(id: "1", name: "Power", category: "Utilities", amount: 200)],
            cards: [Card(id: "1", name: "Visa", balance: 0, minPayment: 50)],
            transactions: [], goals: [], bounds: june,
            billDueInPeriod: { _ in true }, isPro: false, tz: tz
        )
        // Utilities is a need by default, and a card minimum is too.
        checkClose(lens?.rows.first { $0.key == "needs" }?.actual ?? -1, 250,
                   "utilities + card minimum land in needs", tol: 0.0001)

        // An override moves a category to another bucket.
        checkEqual(BudgetRules.billBucket("Utilities", settings: s).rawValue, "needs", "utilities default")
        let overridden = settings([
            "budgetRule": .string("50-30-20"),
            "budgetBucketOverrides": .object(["bills": .object(["Utilities": .string("wants")])]),
        ])
        checkEqual(BudgetRules.billBucket("Utilities", settings: overridden).rawValue, "wants", "override respected")
        let moved = BudgetRules.lens(
            settings: overridden, income: 4000,
            bills: [Bill(id: "1", name: "Power", category: "Utilities", amount: 200)],
            cards: [], transactions: [], goals: [], bounds: june,
            billDueInPeriod: { _ in true }, isPro: false, tz: tz
        )
        checkClose(moved?.rows.first { $0.key == "wants" }?.actual ?? -1, 200,
                   "the overridden bill counts as a want", tol: 0.0001)
    }

    section("BudgetRules — envelope assignments") {
        let s = settings([
            "categoryBudgets": .object(["Groceries": .number(300)]),
            "envelopeAssign": .object(["categories": .object(["Dining": .number(100)])]),
        ])
        let goals = [SavingsGoal(id: "g1", name: "Trip", target: 1200, saved: 0, targetDate: "2027-01-01")]
        let env = BudgetRules.envelopeAssignments(s, goals: goals, tz: tz)
        check(env.goalsTotal > 0, "a dated goal contributes a monthly share")
        checkClose(env.catMap["Groceries"] ?? -1, 300, "a category budget seeds its envelope", tol: 0.0001)
        checkClose(env.catMap["Dining"] ?? -1, 100, "an explicit assignment is kept", tol: 0.0001)
    }

    section("BudgetRules — envelope rollover applies once per period") {
        let s = settings([
            "envelopeRollover": .bool(true),
            "categoryBudgets": .object(["Groceries": .number(100)]),
            "envelopeAssign": .object(["categories": .object(["Groceries": .number(100)])]),
        ])
        let may = Period.bounds(for: makeDate(2026, 5, 1, tz: tz), config: cfg, tz: tz)
        let spent = [SpendTransaction(id: "1", date: "2026-05-10", amount: 40, category: "Groceries")]

        let next = BudgetRules.applyEnvelopeRollover(s, transactions: spent, prevBounds: may)
        checkClose(next.envelopeRolloverBal.categories["Groceries"] ?? -1, 60,
                   "the unspent 60 rolls forward", tol: 0.0001)
        checkEqual(next.envelopeRolloverAppliedFor, may.key, "the period is stamped")

        // Idempotent: running again for the same period must not double it.
        let again = BudgetRules.applyEnvelopeRollover(next, transactions: spent, prevBounds: may)
        checkClose(again.envelopeRolloverBal.categories["Groceries"] ?? -1, 60,
                   "a second run for the same period changes nothing", tol: 0.0001)

        // Off by default — nothing rolls unless the user opted in.
        let optedOut = settings(["categoryBudgets": .object(["Groceries": .number(100)])])
        let untouched = BudgetRules.applyEnvelopeRollover(optedOut, transactions: spent, prevBounds: may)
        check(untouched.envelopeRolloverBal.categories["Groceries"] == nil, "disabled → no rollover")
    }
}

/// Mirrors SpendingInsightsTest.kt and client/js/spendingInsights.test.js.
func runSpendingInsightsChecks() {
    let tz = utcTZ
    let cfg = PeriodConfig(mode: "calendar", length: 35)
    let june = Period.bounds(for: makeDate(2026, 6, 15, tz: tz), config: cfg, tz: tz)
    let may = Period.bounds(for: makeDate(2026, 5, 15, tz: tz), config: cfg, tz: tz)

    func tx(_ amount: Double, _ category: String, _ date: String) -> SpendTransaction {
        SpendTransaction(id: "t-\(date)-\(category)-\(amount)", date: date, amount: amount, category: category)
    }

    section("SpendingInsights — spentByCategory") {
        let spend = SpendingInsights.spentByCategory(
            [
                tx(20, "Groceries", "2026-06-01"),   // first day is inside
                tx(30, "Groceries", "2026-06-30"),   // last day is inside
                tx(10, "Dining", "2026-06-15"),
                tx(99, "Dining", "2026-07-01"),      // the end is exclusive
                tx(99, "Dining", "2026-05-31"),      // before the start
            ],
            bounds: june
        )
        checkClose(spend["Groceries"] ?? -1, 50, "in-period groceries are summed", tol: 0.0001)
        checkClose(spend["Dining"] ?? -1, 10, "out-of-period dining is excluded", tol: 0.0001)

        let odd = SpendingInsights.spentByCategory(
            [
                tx(5, "", "2026-06-02"),
                tx(7, "Other", "2026-06-03"),
                tx(99, "Groceries", ""),             // never entered
                tx(99, "Groceries", "not-a-date"),
            ],
            bounds: june
        )
        checkClose(odd["Other"] ?? -1, 12, "a blank category folds into Other", tol: 0.0001)
        check(odd["Groceries"] == nil, "unusable dates are dropped")
    }

    section("SpendingInsights — compute") {
        let rows = SpendingInsights.compute(
            [
                tx(150, "Groceries", "2026-06-10"),
                tx(100, "Groceries", "2026-05-10"),
                tx(20, "Dining", "2026-06-11"),
                tx(80, "Dining", "2026-05-11"),
            ],
            currentBounds: june, prevBounds: may
        )
        let byCat = Dictionary(uniqueKeysWithValues: rows.map { ($0.cat, $0) })
        checkClose(byCat["Groceries"]?.delta ?? 0, 50, "groceries rose by 50", tol: 0.0001)
        checkEqual(byCat["Groceries"]?.pct, 50, "a 50% rise")
        checkClose(byCat["Dining"]?.delta ?? 0, -60, "dining fell by 60", tol: 0.0001)
        checkEqual(byCat["Dining"]?.pct, -75, "a 75% fall")

        let edges = Dictionary(uniqueKeysWithValues: SpendingInsights.compute(
            [
                tx(40, "Health", "2026-06-12"),      // new this period
                tx(90, "Transport", "2026-05-12"),   // stopped this period
            ],
            currentBounds: june, prevBounds: may
        ).map { ($0.cat, $0) })
        // No previous spending to compare against reads as a full 100% rise.
        checkEqual(edges["Health"]?.pct, 100, "spending that started reads as +100%")
        // A category you stopped spending in still reports, as a fall to zero.
        checkClose(edges["Transport"]?.now ?? -1, 0, "a stopped category is now zero", tol: 0.0001)
        checkEqual(edges["Transport"]?.pct, -100, "and reads as −100%")

        let quiet = SpendingInsights.compute([tx(10, "Dining", "2026-06-10")], currentBounds: june, prevBounds: may)
        checkEqual(quiet.map { $0.cat }, ["Dining"], "categories with no activity are omitted")
        check(SpendingInsights.compute([], currentBounds: june, prevBounds: may).isEmpty, "no data → no rows")

        let sorted = SpendingInsights.compute(
            [
                tx(30, "Dining", "2026-06-10"),      // +30
                tx(10, "Groceries", "2026-06-10"),   // +10
                tx(200, "Shopping", "2026-05-10"),   // −200, the biggest move
            ],
            currentBounds: june, prevBounds: may
        )
        checkEqual(sorted.map { $0.cat }, ["Shopping", "Dining", "Groceries"],
                   "the biggest swing leads, whatever its direction")
    }
}
