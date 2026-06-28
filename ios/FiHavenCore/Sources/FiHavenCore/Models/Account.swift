import Foundation

/// An asset account (what you own) — checking, savings, investments,
/// property, cash, etc. Paired with the debts in `cards` to compute net
/// worth = assets − liabilities. Mirrors the web `accounts` shape.
public struct Account: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var type: String    // "checking" | "savings" | "investment" | "property" | "cash" | "other"
    public var balance: Double
    public var notes: String

    public init(
        id: String,
        name: String = "",
        type: String = "checking",
        balance: Double = 0,
        notes: String = ""
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.balance = balance
        self.notes = notes
    }

    enum CodingKeys: String, CodingKey {
        case id, name, type, balance, notes
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        name = c.flexibleString(.name) ?? ""
        type = c.flexibleString(.type) ?? "checking"
        balance = c.flexibleDouble(.balance) ?? 0
        notes = c.flexibleString(.notes) ?? ""
    }
}
