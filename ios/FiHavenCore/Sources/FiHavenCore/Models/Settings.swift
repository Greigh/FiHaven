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
}
