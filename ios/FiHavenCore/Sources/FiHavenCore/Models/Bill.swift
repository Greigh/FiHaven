import Foundation

/// A recurring bill. Shape mirrors the web client (see
/// docs/native-contract.md §6). `frequency` is an informational label —
/// the scheduler treats every bill as monthly on `dueDay`.
public struct Bill: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var category: String
    /// What the bill costs. **nil means never filled in**, which is different
    /// from an explicit 0 ("nothing is due"). A zero goal satisfies
    /// `remaining <= 0`, so collapsing the two made a blank-amount bill read
    /// "Paid this month" forever with no payment behind it. Use `amountOrZero`
    /// for arithmetic.
    public var amount: Double?
    public var dueDay: Int?
    public var frequency: String
    public var autopay: Bool
    public var autopayDay: Int?        // "Autopay day" — day money is pulled; nil falls back to dueDay
    public var notes: String
    public var business: String?
    public var cardId: String?         // "Charged to" — id of the card this bill is paid on
    public var startDate: String?      // "First bill due on" — "YYYY-MM-DD"; gates when it begins
    public var endDate: String?        // "Stops on" — "YYYY-MM-DD"; bill is retired after this
    public var trialEnds: String?      // Free trial end — "YYYY-MM-DD"; subscription panel + reminders
    public var manageUrl: String?      // User-saved manage/cancel link (subscription panel)
    public var archived: Bool          // Soft delete — hidden from lists/totals, restorable

    public init(
        id: String,
        name: String,
        category: String = "Other",
        amount: Double? = nil,
        dueDay: Int? = nil,
        frequency: String = "Monthly",
        autopay: Bool = false,
        autopayDay: Int? = nil,
        notes: String = "",
        business: String? = nil,
        cardId: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        trialEnds: String? = nil,
        manageUrl: String? = nil,
        archived: Bool = false
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.amount = amount
        self.dueDay = dueDay
        self.frequency = frequency
        self.autopay = autopay
        self.autopayDay = autopayDay
        self.notes = notes
        self.business = business
        self.cardId = cardId
        self.startDate = startDate
        self.endDate = endDate
        self.trialEnds = trialEnds
        self.manageUrl = manageUrl
        self.archived = archived
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, amount, dueDay, frequency, autopay, autopayDay, notes, business, cardId
        case startDate, endDate, trialEnds, manageUrl, archived
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        name = c.flexibleString(.name) ?? ""
        category = c.flexibleString(.category) ?? "Other"
        amount = c.flexibleDouble(.amount)
        dueDay = c.flexibleInt(.dueDay)
        frequency = c.flexibleString(.frequency) ?? "Monthly"
        autopay = c.flexibleBool(.autopay) ?? false
        autopayDay = c.flexibleInt(.autopayDay)
        notes = c.flexibleString(.notes) ?? ""
        business = c.flexibleString(.business)
        cardId = c.flexibleString(.cardId)
        startDate = c.flexibleString(.startDate)
        endDate = c.flexibleString(.endDate)
        trialEnds = c.flexibleString(.trialEnds)
        manageUrl = c.flexibleString(.manageUrl)
        archived = c.flexibleBool(.archived) ?? false
    }

    /// The amount for arithmetic — a blank amount contributes nothing. Use
    /// `amount` itself to ask whether one was ever set.
    public var amountOrZero: Double { amount ?? 0 }
}
