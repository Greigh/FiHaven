import Foundation

/// A recorded payment against a bill or card. `refId` is compared as a
/// string everywhere (the web stores `String(bill.id)`).
public struct Payment: Codable, Identifiable, Equatable, Sendable {
    /// Stored as a String to match the web's canonical id format
    /// (`Date.now().toString(36) + random`). Decoding a legacy numeric
    /// id is handled by `flexibleString`, so old native data still loads.
    public var id: String
    public var type: String        // "bill" | "card"
    public var refId: String
    public var name: String
    public var amount: Double
    public var date: String        // ISO date string
    public var monthKey: String    // "YYYY-MM" — the month this satisfies
    public var note: String
    /// A "skip" marker (amount 0): the item owes nothing this month but it
    /// isn't a real payment. Excluded from totals and history.
    public var skipped: Bool

    public init(
        id: String,
        type: String,
        refId: String,
        name: String = "",
        amount: Double = 0,
        date: String = "",
        monthKey: String = "",
        note: String = "",
        skipped: Bool = false
    ) {
        self.id = id
        self.type = type
        self.refId = refId
        self.name = name
        self.amount = amount
        self.date = date
        self.monthKey = monthKey
        self.note = note
        self.skipped = skipped
    }

    enum CodingKeys: String, CodingKey {
        case id, type, refId, name, amount, date, monthKey, note, skipped
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        type = c.flexibleString(.type) ?? ""
        refId = c.flexibleString(.refId) ?? ""
        name = c.flexibleString(.name) ?? ""
        amount = c.flexibleDouble(.amount) ?? 0
        date = c.flexibleString(.date) ?? ""
        monthKey = c.flexibleString(.monthKey) ?? ""
        note = c.flexibleString(.note) ?? ""
        skipped = c.flexibleBool(.skipped) ?? false
    }
}
