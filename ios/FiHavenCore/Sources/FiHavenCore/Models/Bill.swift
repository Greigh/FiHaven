import Foundation

/// A recurring bill. Shape mirrors the web client (see
/// docs/native-contract.md §6). `frequency` is an informational label —
/// the scheduler treats every bill as monthly on `dueDay`.
public struct Bill: Codable, Identifiable, Equatable, Sendable {
    public var id: Int
    public var name: String
    public var category: String
    public var amount: Double
    public var dueDay: Int?
    public var frequency: String
    public var autopay: Bool
    public var notes: String

    public init(
        id: Int,
        name: String,
        category: String = "Other",
        amount: Double = 0,
        dueDay: Int? = nil,
        frequency: String = "Monthly",
        autopay: Bool = false,
        notes: String = ""
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.amount = amount
        self.dueDay = dueDay
        self.frequency = frequency
        self.autopay = autopay
        self.notes = notes
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, amount, dueDay, frequency, autopay, notes
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleInt(.id) ?? 0
        name = c.flexibleString(.name) ?? ""
        category = c.flexibleString(.category) ?? "Other"
        amount = c.flexibleDouble(.amount) ?? 0
        dueDay = c.flexibleInt(.dueDay)
        frequency = c.flexibleString(.frequency) ?? "Monthly"
        autopay = c.flexibleBool(.autopay) ?? false
        notes = c.flexibleString(.notes) ?? ""
    }
}
