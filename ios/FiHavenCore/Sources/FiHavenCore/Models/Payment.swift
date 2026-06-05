import Foundation

/// A recorded payment against a bill or card. `refId` is compared as a
/// string everywhere (the web stores `String(bill.id)`).
public struct Payment: Codable, Identifiable, Equatable, Sendable {
    public var id: Int
    public var type: String        // "bill" | "card"
    public var refId: String
    public var name: String
    public var amount: Double
    public var date: String        // ISO date string
    public var monthKey: String    // "YYYY-MM" — the month this satisfies
    public var note: String

    public init(
        id: Int,
        type: String,
        refId: String,
        name: String = "",
        amount: Double = 0,
        date: String = "",
        monthKey: String = "",
        note: String = ""
    ) {
        self.id = id
        self.type = type
        self.refId = refId
        self.name = name
        self.amount = amount
        self.date = date
        self.monthKey = monthKey
        self.note = note
    }

    enum CodingKeys: String, CodingKey {
        case id, type, refId, name, amount, date, monthKey, note
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleInt(.id) ?? 0
        type = c.flexibleString(.type) ?? ""
        refId = c.flexibleString(.refId) ?? ""
        name = c.flexibleString(.name) ?? ""
        amount = c.flexibleDouble(.amount) ?? 0
        date = c.flexibleString(.date) ?? ""
        monthKey = c.flexibleString(.monthKey) ?? ""
        note = c.flexibleString(.note) ?? ""
    }
}
