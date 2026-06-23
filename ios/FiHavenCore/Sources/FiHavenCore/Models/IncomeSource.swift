import Foundation

/// One income stream in `settings.incomes`. `frequency` is one of
/// hourly | weekly | biweekly | semimonthly | monthly | annual (see Income).
/// For `hourly`, `amount` is the hourly rate and `hoursPerWeek` the weekly hours.
public struct IncomeSource: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var amount: Double
    public var frequency: String
    public var hoursPerWeek: Double

    public init(id: String, label: String, amount: Double, frequency: String, hoursPerWeek: Double = 0) {
        self.id = id
        self.label = label
        self.amount = amount
        self.frequency = frequency
        self.hoursPerWeek = hoursPerWeek
    }

    /// Build from a loose JSON object (the `settings` bag isn't strongly
    /// typed on the wire). Returns nil if it isn't an object.
    public init?(json: JSONValue) {
        guard let o = json.asObject else { return nil }
        self.id = o["id"]?.asString ?? UUID().uuidString
        self.label = o["label"]?.asString ?? ""
        self.amount = o["amount"]?.asDouble ?? 0
        self.frequency = o["frequency"]?.asString ?? "monthly"
        self.hoursPerWeek = o["hoursPerWeek"]?.asDouble ?? 0
    }

    /// Round-trip back into the JSON bag. Only emits hoursPerWeek for hourly
    /// sources so other sources stay byte-identical to before.
    public var json: JSONValue {
        var obj: [String: JSONValue] = [
            "id": .string(id),
            "label": .string(label),
            "amount": .number(amount),
            "frequency": .string(frequency),
        ]
        if frequency == "hourly" { obj["hoursPerWeek"] = .number(hoursPerWeek) }
        return .object(obj)
    }
}
