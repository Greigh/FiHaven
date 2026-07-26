import Foundation

/// A spending transaction (manual or imported). `amount` is the spent
/// amount (positive). Categorized for the per-category budgets. Mirrors
/// the web `transactions` shape; `id` is a string like payments.
public struct SpendTransaction: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var date: String        // "YYYY-MM-DD"
    public var amount: Double
    public var category: String
    public var merchant: String
    public var note: String
    // Provenance: "manual" (default) or "plaid" (bank-synced helper). Bank rows
    // are additive — the manual-first data is never overwritten. Preserved on
    // re-encode so a native write doesn't strip the server's bank tags.
    public var source: String
    public var plaidId: String?
    public var pending: Bool
    /// Plaid account this charge came from. A card pinned to the same account
    /// claims the row, which is how per-card spending works. Resolved at read
    /// time so re-pointing a card re-attributes its whole history.
    public var accountId: String?

    public init(
        id: String,
        date: String = "",
        amount: Double = 0,
        category: String = "Other",
        merchant: String = "",
        note: String = "",
        source: String = "manual",
        plaidId: String? = nil,
        pending: Bool = false,
        accountId: String? = nil
    ) {
        self.id = id
        self.date = date
        self.amount = amount
        self.category = category
        self.merchant = merchant
        self.note = note
        self.source = source
        self.plaidId = plaidId
        self.pending = pending
        self.accountId = accountId
    }

    enum CodingKeys: String, CodingKey {
        case id, date, amount, category, merchant, note, source, plaidId, pending, accountId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        date = c.flexibleString(.date) ?? ""
        amount = c.flexibleDouble(.amount) ?? 0
        category = c.flexibleString(.category) ?? "Other"
        merchant = c.flexibleString(.merchant) ?? ""
        note = c.flexibleString(.note) ?? ""
        source = c.flexibleString(.source) ?? "manual"
        plaidId = c.flexibleString(.plaidId)
        pending = c.flexibleBool(.pending) ?? false
        accountId = c.flexibleString(.accountId)
    }

    public var isBank: Bool { source == "plaid" }
}

/// The spending categories used for budgets and the transaction picker.
public let spendingCategories = [
    "Groceries", "Dining", "Shopping", "Transport", "Entertainment", "Health", "Bills", "Other",
]
