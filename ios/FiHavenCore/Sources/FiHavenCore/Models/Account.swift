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
    /// The Plaid account this row follows, when the user pinned one (or the
    /// server auto-linked it). `Account.noPlaidLink` means "never match me".
    /// Must be modelled here even though the app only reads it: a fixed struct
    /// drops keys it doesn't know, so omitting it would strip the link on the
    /// next save from this device.
    public var plaidAccountId: String?

    /// `plaidAccountId` value meaning "never match this account to a bank".
    /// Kept in sync with NO_LINK in server/plaidBalances.js.
    public static let noPlaidLink = "none"

    public init(
        id: String,
        name: String = "",
        type: String = "checking",
        balance: Double = 0,
        notes: String = "",
        plaidAccountId: String? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.balance = balance
        self.notes = notes
        self.plaidAccountId = plaidAccountId
    }

    enum CodingKeys: String, CodingKey {
        case id, name, type, balance, notes, plaidAccountId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        name = c.flexibleString(.name) ?? ""
        type = c.flexibleString(.type) ?? "checking"
        balance = c.flexibleDouble(.balance) ?? 0
        notes = c.flexibleString(.notes) ?? ""
        plaidAccountId = c.flexibleString(.plaidAccountId)
    }
}
