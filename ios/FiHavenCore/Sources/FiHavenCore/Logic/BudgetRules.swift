import Foundation

/// Budget lenses on the Budget tab — port of budgetRules.js.
public enum BudgetRules {
    public enum Bucket: String { case needs, wants, save }

    public struct Splits: Equatable, Sendable {
        public var needs: Int; public var wants: Int; public var save: Int
        public init(needs: Int, wants: Int, save: Int) { self.needs = needs; self.wants = wants; self.save = save }
    }

    public struct Row: Equatable, Sendable {
        public var key: String; public var label: String
        public var pct: Int?; public var target: Double?; public var actual: Double
        public var delta: Double; public var status: String; public var hint: String?
    }

    public struct Headline: Equatable, Sendable {
        public var label: String; public var amount: Double; public var status: String
    }

    public struct Warning: Equatable, Sendable {
        public var key: String; public var label: String; public var amount: Double
        public var pct: Double; public var limit: Int; public var over: Bool
    }

    public struct EnvelopeAssignments: Equatable, Sendable {
        public var goalMap: [String: Double]
        public var catMap: [String: Double]
        public var goalsTotal: Double
        public var catsTotal: Double
        public var total: Double
    }

    public struct Lens: Equatable, Sendable {
        public var mode: String; public var title: String; public var subtitle: String
        public var headline: Headline?; public var rows: [Row]; public var warnings: [Warning]
        public var proLocked: Bool
        public var envelope: EnvelopeAssignments?
    }

    public static let housingRatioLimit = 30
    public static let debtRatioLimit = 36

    private static let presetSplits: [String: Splits] = [
        "50-30-20": Splits(needs: 50, wants: 30, save: 20),
        "80-20": Splits(needs: 80, wants: 0, save: 20),
        "60-20-20": Splits(needs: 60, wants: 20, save: 20),
        "70-20-10": Splits(needs: 70, wants: 20, save: 10),
    ]

    private static let splitModes: Set<String> = Set(presetSplits.keys).union(["custom"])

    private static let billBuckets: [String: Bucket] = [
        "Housing": .needs, "Utilities": .needs, "Insurance": .needs,
        "Loan": .needs, "Auto": .needs, "Subscriptions": .wants,
        "Investment": .save, "Other": .needs,
    ]

    private static let spendingBuckets: [String: Bucket] = [
        "Groceries": .needs, "Dining": .wants, "Shopping": .wants,
        "Transport": .needs, "Entertainment": .wants, "Health": .needs,
        "Bills": .needs, "Other": .wants,
    ]

    private static let debtBillCategories: Set<String> = ["Loan", "Auto"]

    private static let titles: [String: String] = [
        "50-30-20": "50 / 30 / 20", "80-20": "80 / 20", "60-20-20": "60 / 20 / 20",
        "70-20-10": "70 / 20 / 10", "custom": "Custom split",
        "obligations-first": "Obligations first", "debt-focus": "Debt focus", "envelope": "Envelope lite",
    ]

    public static func mode(from settings: Settings) -> String {
        switch settings.budgetRule {
        case "50-30-20", "503020": return "50-30-20"
        case "80-20", "60-20-20", "70-20-10", "custom": return settings.budgetRule
        case "obligations-first", "obligations": return "obligations-first"
        case "debt-focus", "debt": return "debt-focus"
        case "envelope": return "envelope"
        default: return "off"
        }
    }

    public static func enabled(_ settings: Settings) -> Bool { mode(from: settings) != "off" }
    public static func title(_ mode: String) -> String { titles[mode] ?? mode }

    public static let billCategories = CTConstants.categories

    public static func billBucket(_ category: String, settings: Settings) -> Bucket {
        let o = settings.budgetBucketOverrides.bills[category]
        if let o, let b = Bucket(rawValue: o) { return b }
        return billBuckets[category] ?? .needs
    }

    public static func spendingBucket(_ category: String, settings: Settings) -> Bucket {
        let o = settings.budgetBucketOverrides.spending[category]
        if let o, let b = Bucket(rawValue: o) { return b }
        return spendingBuckets[category] ?? .wants
    }

    public static func transactionInPeriod(_ date: String, bounds: PeriodBounds) -> Bool {
        guard !date.isEmpty else { return false }
        return date >= bounds.startKey && date < bounds.endKey
    }

    public static func envelopeAssignments(_ settings: Settings, goals: [SavingsGoal], tz: TimeZone) -> EnvelopeAssignments {
        var goalMap = settings.envelopeAssign.goals
        var catMap = settings.envelopeAssign.categories
        let rolloverCats = settings.envelopeRolloverBal.categories

        for g in goals {
            let id = g.id
            if goalMap[id] == nil {
                let sug = suggestedGoalMonthly(g, tz: tz)
                if sug > 0 { goalMap[id] = sug }
            }
        }

        for (cat, budget) in settings.categoryBudgets {
            if catMap[cat] == nil { catMap[cat] = budget }
        }

        if settings.envelopeRollover {
            for (cat, extra) in rolloverCats where extra > 0 {
                catMap[cat] = (catMap[cat] ?? 0) + extra
            }
        }

        let goalsTotal = goalMap.values.reduce(0, +)
        let catsTotal = catMap.values.reduce(0, +)
        return EnvelopeAssignments(
            goalMap: goalMap, catMap: catMap,
            goalsTotal: goalsTotal, catsTotal: catsTotal,
            total: goalsTotal + catsTotal
        )
    }

    /// Apply unused category budget from the previous period into envelopeRolloverBal.
    public static func applyEnvelopeRollover(
        _ settings: Settings,
        transactions: [SpendTransaction],
        prevBounds: PeriodBounds
    ) -> Settings {
        guard settings.envelopeRollover else { return settings }
        let mk = prevBounds.key
        if settings.envelopeRolloverAppliedFor == mk { return settings }

        let spent = SpendingInsights.spentByCategory(transactions, bounds: prevBounds)
        let budgets = settings.categoryBudgets
        let assign = settings.envelopeAssign.categories
        var nextCats = settings.envelopeRolloverBal.categories

        for cat in budgets.keys {
            let budget = assign[cat] ?? budgets[cat] ?? 0
            let unused = max(0, budget - (spent[cat] ?? 0))
            if unused > 0.005 {
                nextCats[cat] = (nextCats[cat] ?? 0) + unused
            }
        }

        var next = settings
        next.envelopeRolloverBal = Settings.EnvelopeRolloverBal(categories: nextCats)
        next.envelopeRolloverAppliedFor = mk
        return next
    }

    public static func splits(from settings: Settings) -> Splits? {
        let m = mode(from: settings)
        if let p = presetSplits[m] { return p }
        guard m == "custom" else { return nil }
        let raw = settings.budgetRuleSplits
        let sum = raw.needs + raw.wants + raw.save
        guard sum > 0 else { return Splits(needs: 50, wants: 30, save: 20) }
        return Splits(
            needs: Int((Double(raw.needs) / Double(sum) * 100).rounded()),
            wants: Int((Double(raw.wants) / Double(sum) * 100).rounded()),
            save: Int((Double(raw.save) / Double(sum) * 100).rounded())
        )
    }

    public static func suggestedGoalMonthly(_ g: SavingsGoal, tz: TimeZone) -> Double {
        let remaining = max(0, g.target - g.saved)
        guard !g.targetDate.isEmpty, remaining > 0 else { return 0 }
        let months = max(1, DateLogic.monthsUntil(g.targetDate, tz: tz))
        return remaining / Double(months)
    }

    public static func lens(
        settings: Settings,
        income: Double,
        bills: [Bill],
        cards: [Card],
        transactions: [SpendTransaction],
        goals: [SavingsGoal],
        bounds: PeriodBounds,
        billDueInPeriod: (Bill) -> Bool,
        isPro: Bool,
        tz: TimeZone,
        billAmount: (Bill) -> Double = { $0.amount },
        cardAmount: (Card) -> Double = { $0.minPayment }
    ) -> Lens? {
        let m = mode(from: settings)
        guard m != "off" else { return nil }
        if m != "envelope" && income <= 0 { return nil }
        let warnings = ratioWarnings(income: income, bills: bills, cards: cards,
            billDueInPeriod: billDueInPeriod, billAmount: billAmount, cardAmount: cardAmount)
        switch m {
        case "obligations-first":
            return obligationsFirst(income: income, bills: bills, cards: cards, goals: goals,
                billDueInPeriod: billDueInPeriod, billAmount: billAmount, cardAmount: cardAmount,
                warnings: warnings, tz: tz)
        case "debt-focus":
            return debtFocus(income: income, settings: settings, bills: bills, cards: cards,
                billDueInPeriod: billDueInPeriod, billAmount: billAmount, cardAmount: cardAmount, warnings: warnings)
        case "envelope":
            return envelope(income: income, settings: settings, bills: bills, cards: cards, goals: goals,
                billDueInPeriod: billDueInPeriod, isPro: isPro, billAmount: billAmount, cardAmount: cardAmount,
                warnings: warnings, tz: tz)
        default:
            guard splitModes.contains(m) else { return nil }
            return splitLens(mode: m, settings: settings, income: income, bills: bills, cards: cards,
                transactions: transactions, bounds: bounds, billDueInPeriod: billDueInPeriod,
                billAmount: billAmount, cardAmount: cardAmount, warnings: warnings)
        }
    }

    private static func obligationsTotal(bills: [Bill], cards: [Card], billDueInPeriod: (Bill) -> Bool,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double) -> Double {
        bills.filter(billDueInPeriod).reduce(0) { $0 + billAmount($1) }
            + cards.reduce(0) { $0 + cardAmount($1) }
    }

    private static func ratioWarnings(income: Double, bills: [Bill], cards: [Card],
        billDueInPeriod: (Bill) -> Bool, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double) -> [Warning] {
        guard income > 0 else { return [] }
        var out: [Warning] = []
        let housing = bills.filter { $0.category == "Housing" && billDueInPeriod($0) }.reduce(0) { $0 + billAmount($1) }
        if housing > 0 {
            let pct = housing / income * 100
            out.append(Warning(key: "housing", label: "Housing", amount: housing, pct: (pct * 10).rounded() / 10,
                limit: housingRatioLimit, over: pct > Double(housingRatioLimit) + 0.05))
        }
        var debt = cards.reduce(0) { $0 + cardAmount($1) }
        debt += bills.filter { debtBillCategories.contains($0.category) && billDueInPeriod($0) }.reduce(0) { $0 + billAmount($1) }
        if debt > 0 {
            let pct = debt / income * 100
            out.append(Warning(key: "debt", label: "Debt payments", amount: debt, pct: (pct * 10).rounded() / 10,
                limit: debtRatioLimit, over: pct > Double(debtRatioLimit) + 0.05))
        }
        return out
    }

    private static func splitLens(mode: String, settings: Settings, income: Double, bills: [Bill], cards: [Card],
        transactions: [SpendTransaction], bounds: PeriodBounds, billDueInPeriod: (Bill) -> Bool,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double, warnings: [Warning]) -> Lens? {
        guard let sp = splits(from: settings) else { return nil }
        var actual: [Bucket: Double] = [.needs: 0, .wants: 0, .save: 0]
        bills.filter(billDueInPeriod).forEach { b in
            actual[billBucket(b.category, settings: settings), default: 0] += billAmount(b)
        }
        cards.forEach { actual[.needs, default: 0] += cardAmount($0) }
        transactions.forEach { t in
            guard transactionInPeriod(t.date, bounds: bounds) else { return }
            actual[spendingBucket(t.category, settings: settings), default: 0] += abs(t.amount)
        }
        actual[.save] = max(0, income - actual[.needs, default: 0] - actual[.wants, default: 0])
        let rows = [
            splitRow("needs", "Needs", sp.needs, income * Double(sp.needs) / 100, actual[.needs]!),
            splitRow("wants", "Wants", sp.wants, income * Double(sp.wants) / 100, actual[.wants]!),
            splitRow("save", "Save", sp.save, income * Double(sp.save) / 100, actual[.save]!, isSave: true),
        ]
        return Lens(mode: mode, title: title(mode), subtitle: "Needs, wants, and save targets from income.",
            headline: nil, rows: rows, warnings: warnings, proLocked: false, envelope: nil)
    }

    private static func obligationsFirst(income: Double, bills: [Bill], cards: [Card], goals: [SavingsGoal],
        billDueInPeriod: (Bill) -> Bool, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: [Warning], tz: TimeZone) -> Lens {
        let obligations = obligationsTotal(bills: bills, cards: cards, billDueInPeriod: billDueInPeriod,
            billAmount: billAmount, cardAmount: cardAmount)
        let goalMonthly = goals.reduce(0) { $0 + suggestedGoalMonthly($1, tz: tz) }
        let safe = income - obligations - goalMonthly
        let rows = [
            Row(key: "income", label: "Income", pct: nil, target: nil, actual: income, delta: 0, status: "ok", hint: nil),
            Row(key: "obligations", label: "Bills + minimums", pct: nil, target: nil, actual: obligations, delta: 0, status: "ok", hint: nil),
            Row(key: "goals", label: "Goal contributions", pct: nil, target: nil, actual: goalMonthly, delta: 0, status: "ok",
                hint: goalMonthly > 0 ? "Suggested monthly from savings goals" : "Add target dates on goals"),
        ]
        return Lens(mode: "obligations-first", title: title("obligations-first"),
            subtitle: "What is left after fixed obligations and planned savings.",
            headline: Headline(label: "Safe to spend", amount: safe, status: safe >= 0 ? "ok" : "over"),
            rows: rows, warnings: warnings, proLocked: false, envelope: nil)
    }

    private static func debtFocus(income: Double, settings: Settings, bills: [Bill], cards: [Card],
        billDueInPeriod: (Bill) -> Bool, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: [Warning]) -> Lens {
        var mins = cards.reduce(0) { $0 + cardAmount($1) }
        mins += bills.filter { debtBillCategories.contains($0.category) && billDueInPeriod($0) }.reduce(0) { $0 + billAmount($1) }
        let extra = max(0, settings.debtFocusExtra)
        let flex = income - mins - extra
        let rows = [
            Row(key: "minimums", label: "Debt minimums", pct: nil, target: mins, actual: mins, delta: 0, status: "ok", hint: nil),
            Row(key: "extra", label: "Extra debt payment", pct: nil, target: extra, actual: extra, delta: 0, status: "ok",
                hint: "Set in Settings → Budget lens"),
            Row(key: "flex", label: "Flexible spending", pct: nil, target: max(0, flex), actual: flex, delta: 0,
                status: flex >= 0 ? "ok" : "over", hint: nil),
        ]
        return Lens(mode: "debt-focus", title: title("debt-focus"), subtitle: "Minimums plus your planned extra payment.",
            headline: Headline(label: "After debt plan", amount: flex, status: flex >= 0 ? "ok" : "over"),
            rows: rows, warnings: warnings, proLocked: false, envelope: nil)
    }

    private static func envelope(income: Double, settings: Settings, bills: [Bill], cards: [Card], goals: [SavingsGoal],
        billDueInPeriod: (Bill) -> Bool, isPro: Bool, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: [Warning], tz: TimeZone) -> Lens {
        if !isPro {
            return Lens(mode: "envelope", title: title("envelope"), subtitle: "Assign every dollar — goals plus category budgets.",
                headline: nil, rows: [], warnings: [], proLocked: true, envelope: nil)
        }
        let obligations = obligationsTotal(bills: bills, cards: cards, billDueInPeriod: billDueInPeriod,
            billAmount: billAmount, cardAmount: cardAmount)
        let env = envelopeAssignments(settings, goals: goals, tz: tz)
        let unassigned = income - obligations - env.total
        let rows = [
            Row(key: "obligations", label: "Fixed obligations", pct: nil, target: nil, actual: obligations, delta: 0, status: "ok", hint: nil),
            Row(key: "goals", label: "Assigned to goals", pct: nil, target: nil, actual: env.goalsTotal, delta: 0, status: "ok", hint: nil),
            Row(key: "categories", label: "Assigned to categories", pct: nil, target: nil, actual: env.catsTotal, delta: 0, status: "ok", hint: nil),
            Row(key: "unassigned", label: "Left to assign", pct: nil, target: nil, actual: unassigned, delta: 0,
                status: abs(unassigned) < 0.01 ? "ok" : (unassigned > 0 ? "under" : "over"),
                hint: unassigned > 0 ? "Assign to goals or category budgets" : "Over-assigned"),
        ]
        return Lens(mode: "envelope", title: title("envelope"),
            subtitle: "Zero-based lite: goals + category budgets should use income after obligations.",
            headline: Headline(label: "Unassigned", amount: unassigned,
                status: abs(unassigned) < 0.01 ? "ok" : (unassigned > 0 ? "under" : "over")),
            rows: rows, warnings: warnings, proLocked: false, envelope: env)
    }

    private static func splitRow(_ key: String, _ label: String, _ pct: Int, _ target: Double, _ actual: Double, isSave: Bool = false) -> Row {
        let status: String
        if isSave { status = actual >= target - 0.005 ? "ok" : "under" }
        else { status = actual <= target + 0.005 ? "ok" : "over" }
        return Row(key: key, label: label, pct: pct, target: target, actual: actual, delta: actual - target, status: status, hint: nil)
    }

}
