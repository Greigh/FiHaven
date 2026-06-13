import Foundation

/// A credit card, including optional 0%-promo tracking. Shape mirrors the
/// web client (docs/native-contract.md §6).
public struct Card: Codable, Identifiable, Equatable, Sendable {
    public var id: Int
    public var name: String
    public var balance: Double
    public var limit: Double
    public var minPayment: Double
    public var recommendedPayment: Double?   // optional override for the "recommended" payment
    public var regularAPR: Double
    public var hasPromo: Bool
    public var promoAPR: Double?
    public var promoEndDate: String?   // "YYYY-MM-DD"
    public var promoBalance: Double?
    public var dueDay: Int?
    public var autopay: Bool
    public var notes: String
    public var type: String?           // "card" | "loan"
    public var issuer: String?
    public var currentBalance: Double?
    public var lastDigits: String?
    public var network: String?          // "Visa" | "Mastercard" | "Amex" | "Discover" | …
    public var rewardBase: Double        // flat reward % on everything (rewards optimizer)
    public var rewardCategories: [String: Double]   // per-category reward % overrides

    public init(
        id: Int,
        name: String,
        balance: Double = 0,
        limit: Double = 0,
        minPayment: Double = 0,
        recommendedPayment: Double? = nil,
        regularAPR: Double = 0,
        hasPromo: Bool = false,
        promoAPR: Double? = nil,
        promoEndDate: String? = nil,
        promoBalance: Double? = nil,
        dueDay: Int? = nil,
        autopay: Bool = false,
        notes: String = "",
        type: String? = "card",
        issuer: String? = nil,
        currentBalance: Double? = nil,
        lastDigits: String? = nil,
        network: String? = nil,
        rewardBase: Double = 0,
        rewardCategories: [String: Double] = [:]
    ) {
        self.id = id
        self.name = name
        self.balance = balance
        self.limit = limit
        self.minPayment = minPayment
        self.recommendedPayment = recommendedPayment
        self.regularAPR = regularAPR
        self.hasPromo = hasPromo
        self.promoAPR = promoAPR
        self.promoEndDate = promoEndDate
        self.promoBalance = promoBalance
        self.dueDay = dueDay
        self.autopay = autopay
        self.notes = notes
        self.type = type
        self.issuer = issuer
        self.currentBalance = currentBalance
        self.lastDigits = lastDigits
        self.network = network
        self.rewardBase = rewardBase
        self.rewardCategories = rewardCategories
    }

    enum CodingKeys: String, CodingKey {
        case id, name, balance, limit, minPayment, recommendedPayment, regularAPR
        case hasPromo, promoAPR, promoEndDate, promoBalance
        case dueDay, autopay, notes
        case type, issuer, currentBalance, lastDigits, network
        case rewardBase, rewardCategories
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleInt(.id) ?? 0
        name = c.flexibleString(.name) ?? ""
        balance = c.flexibleDouble(.balance) ?? 0
        limit = c.flexibleDouble(.limit) ?? 0
        minPayment = c.flexibleDouble(.minPayment) ?? 0
        recommendedPayment = c.flexibleDouble(.recommendedPayment)
        regularAPR = c.flexibleDouble(.regularAPR) ?? 0
        hasPromo = c.flexibleBool(.hasPromo) ?? false
        promoAPR = c.flexibleDouble(.promoAPR)
        promoEndDate = c.flexibleString(.promoEndDate)
        promoBalance = c.flexibleDouble(.promoBalance)
        dueDay = c.flexibleInt(.dueDay)
        autopay = c.flexibleBool(.autopay) ?? false
        notes = c.flexibleString(.notes) ?? ""
        type = c.flexibleString(.type) ?? "card"
        issuer = c.flexibleString(.issuer)
        currentBalance = c.flexibleDouble(.currentBalance)
        lastDigits = c.flexibleString(.lastDigits)
        network = c.flexibleString(.network)
        rewardBase = c.flexibleDouble(.rewardBase) ?? 0
        // Web writes a plain { "Dining": 4 } object of numbers; tolerate a
        // missing or malformed map by falling back to empty.
        rewardCategories = (try? c.decode([String: Double].self, forKey: .rewardCategories)) ?? [:]
    }
}
