import Foundation

/// The open-ended `settings` bag. We keep the full JSON object so a save
/// never drops keys the app doesn't model (e.g. web-only `theme`), and
/// expose typed accessors for the keys we use.
public struct Settings: Codable, Equatable, Sendable {
    public var raw: [String: JSONValue]

    public init(_ raw: [String: JSONValue] = [:]) {
        self.raw = raw
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        raw = (try? c.decode([String: JSONValue].self)) ?? [:]
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(raw)
    }

    // ── Typed accessors ──────────────────────────────────────────

    /// Multi-source income (preferred over the legacy single field).
    public var incomes: [IncomeSource] {
        get { (raw["incomes"]?.asArray ?? []).compactMap { IncomeSource(json: $0) } }
        set { raw["incomes"] = .array(newValue.map { $0.json }) }
    }

    /// One-off / recurring per-period income changes (bonus, unpaid time off, raise).
    public var incomeAdjustments: [IncomeAdjustment] {
        get { (raw["incomeAdjustments"]?.asArray ?? []).compactMap { IncomeAdjustment(json: $0) } }
        set { raw["incomeAdjustments"] = .array(newValue.map { $0.json }) }
    }

    /// Legacy single monthly income; used as a fallback when `incomes`
    /// is empty (see Income.monthlyIncome).
    public var income: Double {
        get { raw["income"]?.asDouble ?? 0 }
        set { raw["income"] = .number(newValue) }
    }

    /// "YYYY-MM" of the last month the app was opened; drives the
    /// new-month reset banner.
    public var lastVisitKey: String? {
        get { raw["lastVisitKey"]?.asString }
        set { raw["lastVisitKey"] = newValue.map { .string($0) } ?? .null }
    }

    /// IANA timezone name (or nil/"auto" to follow the device).
    public var timezone: String? {
        get { raw["timezone"]?.asString }
        set { raw["timezone"] = newValue.map { .string($0) } ?? .null }
    }

    /// "light" | "dark"; the web persists it here. Native may keep its
    /// own appearance, but we preserve the value on round-trip.
    public var theme: String? {
        get { raw["theme"]?.asString }
        set { raw["theme"] = newValue.map { .string($0) } ?? .null }
    }

    /// "minimum" | "recommended" | "full" — how much must be paid before
    /// a bill/card counts as fully paid. Parsed via PaidGoalPolicy.from.
    public var paidGoal: String? {
        get { raw["paidGoal"]?.asString }
        set { raw["paidGoal"] = newValue.map { .string($0) } ?? .null }
    }

    /// Budget-period mode: "calendar" | "startDay" | "rolling" (see Period).
    public var periodMode: String? {
        get { raw["periodMode"]?.asString }
        set { raw["periodMode"] = newValue.map { .string($0) } ?? .null }
    }
    /// Day-of-month a "startDay" period begins on (1–28).
    public var periodStartDay: Int? {
        get { raw["periodStartDay"]?.asDouble.map { Int($0) } }
        set { raw["periodStartDay"] = newValue.map { .number(Double($0)) } ?? .null }
    }
    /// Length in days of a "rolling" period (7–90).
    public var periodLength: Int? {
        get { raw["periodLength"]?.asDouble.map { Int($0) } }
        set { raw["periodLength"] = newValue.map { .number(Double($0)) } ?? .null }
    }
    /// Optional "YYYY-MM-DD" date a "rolling" period's buckets begin on.
    /// Empty/absent falls back to the stable epoch.
    public var periodAnchor: String? {
        get {
            guard let s = raw["periodAnchor"]?.asString,
                  s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            else { return nil }
            return s
        }
        set { raw["periodAnchor"] = (newValue?.isEmpty == false) ? .string(newValue!) : .null }
    }

    /// ISO 4217 display currency (e.g. "USD", "GBP"). Drives Money formatting.
    public var currency: String? {
        get { raw["currency"]?.asString }
        set { raw["currency"] = newValue.map { .string($0) } ?? .null }
    }

    /// Which tab the app opens to ("dashboard" | "bills" | "cards" | …).
    public var landingView: String? {
        get { raw["landingView"]?.asString }
        set { raw["landingView"] = newValue.map { .string($0) } ?? .null }
    }

    /// Ordered tab ids shown in the bottom bar; tabs not listed fall under
    /// "More". nil = the app's default layout. Synced so a user's tab
    /// arrangement follows them across devices.
    public var tabs: [String]? {
        get { raw["tabs"]?.asArray?.compactMap { $0.asString } }
        set { raw["tabs"] = newValue.map { .array($0.map { .string($0) }) } ?? .null }
    }

    /// Opt-in: email me a few days before a bill is due (server scheduler).
    public var billReminders: Bool {
        get { raw["billReminders"]?.asBool ?? false }
        set { raw["billReminders"] = .bool(newValue) }
    }

    /// When true (default), fully paid items are hidden from the dashboard upcoming list.
    public var hidePaidOnDashboard: Bool {
        get { raw["hidePaidOnDashboard"]?.asBool ?? true }
        set { raw["hidePaidOnDashboard"] = .bool(newValue) }
    }

    /// Dashboard layout: "classic" (fixed) or "widgets" (customizable order).
    public var dashboardLayout: String {
        get { raw["dashboardLayout"]?.asString ?? "classic" }
        set { raw["dashboardLayout"] = .string(newValue) }
    }
    /// Ordered enabled dashboard widget ids (Widgets mode). Empty = default set.
    public var dashboardWidgets: [String] {
        get { raw["dashboardWidgets"]?.asArray?.compactMap { $0.asString } ?? [] }
        set { raw["dashboardWidgets"] = .array(newValue.map { .string($0) }) }
    }

    /// Opt-in: email me a monthly summary on the 1st (server scheduler).
    public var monthlySummary: Bool {
        get { raw["monthlySummary"]?.asBool ?? false }
        set { raw["monthlySummary"] = .bool(newValue) }
    }

    /// Days before a bill's due date to remind (0–14, default 3). Drives both
    /// the server email scheduler and on-device local notifications.
    public var reminderLeadDays: Int {
        get { min(14, max(0, raw["reminderLeadDays"]?.asDouble.map { Int($0) } ?? 3)) }
        set { raw["reminderLeadDays"] = .number(Double(min(14, max(0, newValue)))) }
    }
    /// Local hour (0–23, default 8) reminders/digest/summary are sent.
    public var notifyHour: Int {
        get { min(23, max(0, raw["notifyHour"]?.asDouble.map { Int($0) } ?? 8)) }
        set { raw["notifyHour"] = .number(Double(min(23, max(0, newValue)))) }
    }
    /// Opt-in: also remind on the day a bill is actually due.
    public var remindOnDueDay: Bool {
        get { raw["remindOnDueDay"]?.asBool ?? false }
        set { raw["remindOnDueDay"] = .bool(newValue) }
    }
    /// Opt-in: a weekly digest email (Monday) of upcoming bills + balances.
    public var weeklyDigest: Bool {
        get { raw["weeklyDigest"]?.asBool ?? false }
        set { raw["weeklyDigest"] = .bool(newValue) }
    }
    /// Opt-in: schedule bill reminders as on-device local notifications.
    /// Synced so the preference follows the user, but scheduling is per-device.
    public var localNotifications: Bool {
        get { raw["localNotifications"]?.asBool ?? false }
        set { raw["localNotifications"] = .bool(newValue) }
    }

    /// Budget rule lens: off | 50-30-20 | presets | custom | obligations-first | debt-focus | envelope.
    public var budgetRule: String {
        get { raw["budgetRule"]?.asString ?? "off" }
        set { raw["budgetRule"] = .string(newValue) }
    }

    public struct BudgetRuleSplits: Equatable, Sendable {
        public var needs: Int
        public var wants: Int
        public var save: Int
    }

    /// Planned extra monthly debt payment (debt-focus lens).
    public var debtFocusExtra: Double {
        get { max(0, raw["debtFocusExtra"]?.asDouble ?? 0) }
        set { raw["debtFocusExtra"] = .number(max(0, newValue)) }
    }

    /// Custom needs/wants/save percentages (normalized in BudgetRules.splits).
    public var budgetRuleSplits: BudgetRuleSplits {
        get {
            guard let o = raw["budgetRuleSplits"]?.asObject else {
                return BudgetRuleSplits(needs: 50, wants: 30, save: 20)
            }
            func pct(_ k: String, _ d: Int) -> Int {
                let v = Int(o[k]?.asDouble ?? Double(d))
                return min(100, max(0, v))
            }
            return BudgetRuleSplits(needs: pct("needs", 50), wants: pct("wants", 30), save: pct("save", 20))
        }
        set {
            raw["budgetRuleSplits"] = .object([
                "needs": .number(Double(newValue.needs)),
                "wants": .number(Double(newValue.wants)),
                "save": .number(Double(newValue.save)),
            ])
        }
    }

    /// Per-category monthly spending budgets (category → amount).
    public var categoryBudgets: [String: Double] {
        get {
            guard let o = raw["categoryBudgets"]?.asObject else { return [:] }
            var m: [String: Double] = [:]
            for (k, v) in o { if let d = v.asDouble { m[k] = d } }
            return m
        }
        set { raw["categoryBudgets"] = .object(newValue.mapValues { .number($0) }) }
    }

    /// Opt-in: auto-mark autopay bills/cards paid on their due date.
    public var autopayMark: Bool {
        get { raw["autopayMark"]?.asBool ?? false }
        set { raw["autopayMark"] = .bool(newValue) }
    }
    /// Local hour (0–23) the server auto-marks autopay items.
    public var autopayMarkHour: Int {
        get { raw["autopayMarkHour"]?.asDouble.map { Int($0) } ?? 9 }
        set { raw["autopayMarkHour"] = .number(Double(newValue)) }
    }
    /// Per-calendar-month memory of which items autopay has already
    /// marked ("YYYY-MM" → ["bill:1", "card:2"]). Membership (not a
    /// payment amount) gates a second mark, so an undo sticks and $0
    /// items behave. Shared with autopay.js and the server scheduler.
    public var autopayDone: [String: [String]] {
        get {
            guard let o = raw["autopayDone"]?.asObject else { return [:] }
            return o.reduce(into: [:]) { acc, kv in
                if let arr = kv.value.asArray {
                    acc[kv.key] = arr.compactMap { $0.asString }
                }
            }
        }
        set {
            raw["autopayDone"] = .object(newValue.mapValues { .array($0.map { .string($0) }) })
        }
    }
}
