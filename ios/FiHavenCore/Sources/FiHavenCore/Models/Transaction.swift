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
    /// The category the bank importer assigned, kept alongside the live one so
    /// a later import pass can tell its own guess from a category the user
    /// re-filed by hand (server `retidyStored`). Never shown; preserved on
    /// re-encode so a native write doesn't strip it.
    public var autoCategory: String?

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
        accountId: String? = nil,
        autoCategory: String? = nil
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
        self.autoCategory = autoCategory
    }

    enum CodingKeys: String, CodingKey {
        case id, date, amount, category, merchant, note, source, plaidId, pending, accountId, autoCategory
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
        autoCategory = c.flexibleString(.autoCategory)
    }

    public var isBank: Bool { source == "plaid" }
}

/// The spending categories used for budgets and the transaction picker.
public let spendingCategories = [
    "Groceries", "Dining", "Shopping", "Transport", "Entertainment", "Health", "Bills", "Other",
]

/// Money moved between the user's own accounts — a credit-card payment, a
/// sweep to savings. It shows in the transaction list like anything else but is
/// NOT spending: the purchases a card payment settles were already counted when
/// they posted, so totalling the payment double-counts them.
///
/// Deliberately absent from `spendingCategories`, which drives the per-category
/// budget rows and the bucket picker — a budget for "Transfer" is meaningless.
/// Mirrors TRANSFER_CATEGORY in budgetRules.js / Settings.kt.
public let transferCategory = "Transfer"

/// Categories offered when logging a transaction: budgets get
/// `spendingCategories`, the picker also offers Transfer.
public let transactionCategories = spendingCategories + [transferCategory]

public extension SpendTransaction {
    /// False for transfers; the gate on every spend total.
    var countsAsSpending: Bool { category != transferCategory }
}
