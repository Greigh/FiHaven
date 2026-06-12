import Foundation

/// A one-off or recurring change to a single period's income, stored in
/// `settings.incomeAdjustments`. `amount` is signed: positive adds (a bonus,
/// a raise), negative subtracts (unpaid time off). Mirrors income.js.
public struct IncomeAdjustment: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var amount: Double      // signed
    public var kind: String        // "once" | "recurring"
    public var monthKey: String    // "once" → the single month it applies ("YYYY-MM")
    public var startMonth: String  // "recurring" → first month (inclusive)
    public var endMonth: String    // "recurring" → last month ("" = ongoing)

    public init(
        id: String,
        label: String = "",
        amount: Double = 0,
        kind: String = "once",
        monthKey: String = "",
        startMonth: String = "",
        endMonth: String = ""
    ) {
        self.id = id
        self.label = label
        self.amount = amount
        self.kind = kind
        self.monthKey = monthKey
        self.startMonth = startMonth
        self.endMonth = endMonth
    }

    public init?(json: JSONValue) {
        guard let o = json.asObject else { return nil }
        self.id = o["id"]?.asString ?? UUID().uuidString
        self.label = o["label"]?.asString ?? ""
        self.amount = o["amount"]?.asDouble ?? 0
        self.kind = o["kind"]?.asString == "recurring" ? "recurring" : "once"
        self.monthKey = o["monthKey"]?.asString ?? ""
        self.startMonth = o["startMonth"]?.asString ?? ""
        self.endMonth = o["endMonth"]?.asString ?? ""
    }

    public var json: JSONValue {
        .object([
            "id": .string(id),
            "label": .string(label),
            "amount": .number(amount),
            "kind": .string(kind),
            "monthKey": .string(monthKey),
            "startMonth": .string(startMonth),
            "endMonth": .string(endMonth),
        ])
    }

    /// True if this adjustment affects the period `mk` ("YYYY-MM").
    public func applies(to mk: String) -> Bool {
        guard !mk.isEmpty else { return false }
        if kind == "recurring" {
            if !startMonth.isEmpty && mk < startMonth { return false }
            if !endMonth.isEmpty && mk > endMonth { return false }
            return true
        }
        return monthKey == mk
    }
}
