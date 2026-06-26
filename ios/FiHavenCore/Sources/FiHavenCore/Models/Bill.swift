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
    public var business: String?
    public var cardId: String?         // "Charged to" — id of the card this bill is paid on
    public var startDate: String?      // "First bill due on" — "YYYY-MM-DD"; gates when it begins
    public var endDate: String?        // "Stops on" — "YYYY-MM-DD"; bill is retired after this
    public var trialEnds: String?      // Free trial end — "YYYY-MM-DD"; subscription panel + reminders

    public init(
        id: Int,
        name: String,
        category: String = "Other",
        amount: Double = 0,
        dueDay: Int? = nil,
        frequency: String = "Monthly",
        autopay: Bool = false,
        notes: String = "",
        business: String? = nil,
        cardId: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        trialEnds: String? = nil
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.amount = amount
        self.dueDay = dueDay
        self.frequency = frequency
        self.autopay = autopay
        self.notes = notes
        self.business = business
        self.cardId = cardId
        self.startDate = startDate
        self.endDate = endDate
        self.trialEnds = trialEnds
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, amount, dueDay, frequency, autopay, notes, business, cardId
        case startDate, endDate, trialEnds
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
        business = c.flexibleString(.business)
        cardId = c.flexibleString(.cardId)
        startDate = c.flexibleString(.startDate)
        endDate = c.flexibleString(.endDate)
        trialEnds = c.flexibleString(.trialEnds)
    }
}
