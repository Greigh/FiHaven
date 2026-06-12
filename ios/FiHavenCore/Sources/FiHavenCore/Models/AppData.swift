import Foundation

/// The full per-user data blob returned by `GET /api/data` and written
/// back by `PUT /api/data`. `email` is present on read only.
public struct AppData: Codable, Equatable, Sendable {
    public var email: String?
    public var bills: [Bill]
    public var cards: [Card]
    public var payments: [Payment]
    public var accounts: [Account]
    public var goals: [SavingsGoal]
    public var transactions: [SpendTransaction]
    public var settings: Settings
    /// Present on read only (`GET /api/data`): the effective Pro
    /// entitlement, so the UI can gate features without a second call.
    public var entitlement: Entitlement?

    public init(
        email: String? = nil,
        bills: [Bill] = [],
        cards: [Card] = [],
        payments: [Payment] = [],
        accounts: [Account] = [],
        goals: [SavingsGoal] = [],
        transactions: [SpendTransaction] = [],
        settings: Settings = Settings(),
        entitlement: Entitlement? = nil
    ) {
        self.email = email
        self.bills = bills
        self.cards = cards
        self.payments = payments
        self.accounts = accounts
        self.goals = goals
        self.transactions = transactions
        self.settings = settings
        self.entitlement = entitlement
    }

    enum CodingKeys: String, CodingKey {
        case email, bills, cards, payments, accounts, goals, transactions, settings, entitlement
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try? c.decodeIfPresent(String.self, forKey: .email)
        bills = (try? c.decodeIfPresent([Bill].self, forKey: .bills)) ?? []
        cards = (try? c.decodeIfPresent([Card].self, forKey: .cards)) ?? []
        payments = (try? c.decodeIfPresent([Payment].self, forKey: .payments)) ?? []
        accounts = (try? c.decodeIfPresent([Account].self, forKey: .accounts)) ?? []
        goals = (try? c.decodeIfPresent([SavingsGoal].self, forKey: .goals)) ?? []
        transactions = (try? c.decodeIfPresent([SpendTransaction].self, forKey: .transactions)) ?? []
        settings = (try? c.decodeIfPresent(Settings.self, forKey: .settings)) ?? Settings()
        entitlement = try? c.decodeIfPresent(Entitlement.self, forKey: .entitlement)
    }

    /// True when the account has no bills/cards/payments yet (server is
    /// "empty" — mirrors the web bootstrap check).
    public var isEmpty: Bool {
        bills.isEmpty && cards.isEmpty && payments.isEmpty
    }
}
