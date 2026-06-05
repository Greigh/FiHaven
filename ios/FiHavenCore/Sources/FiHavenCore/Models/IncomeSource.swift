import Foundation

/// One income stream in `settings.incomes`. `frequency` is one of
/// weekly | biweekly | semimonthly | monthly | annual (see Income).
public struct IncomeSource: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var amount: Double
    public var frequency: String

    public init(id: String, label: String, amount: Double, frequency: String) {
        self.id = id
        self.label = label
        self.amount = amount
        self.frequency = frequency
    }

    /// Build from a loose JSON object (the `settings` bag isn't strongly
    /// typed on the wire). Returns nil if it isn't an object.
    public init?(json: JSONValue) {
        guard let o = json.asObject else { return nil }
        self.id = o["id"]?.asString ?? UUID().uuidString
        self.label = o["label"]?.asString ?? ""
        self.amount = o["amount"]?.asDouble ?? 0
        self.frequency = o["frequency"]?.asString ?? "monthly"
    }

    /// Round-trip back into the JSON bag.
    public var json: JSONValue {
        .object([
            "id": .string(id),
            "label": .string(label),
            "amount": .number(amount),
            "frequency": .string(frequency),
        ])
    }
}
