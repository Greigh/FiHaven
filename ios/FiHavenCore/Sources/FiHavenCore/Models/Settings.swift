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

    /// Opt-in: email me a few days before a bill is due (server scheduler).
    public var billReminders: Bool {
        get { raw["billReminders"]?.asBool ?? false }
        set { raw["billReminders"] = .bool(newValue) }
    }

    /// Opt-in: email me a monthly summary on the 1st (server scheduler).
    public var monthlySummary: Bool {
        get { raw["monthlySummary"]?.asBool ?? false }
        set { raw["monthlySummary"] = .bool(newValue) }
    }
}
