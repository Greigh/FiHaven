import Foundation

/// A recurring statement credit on a card (e.g. "$10 Uber Cash" monthly).
/// `frequency` ∈ monthly|quarterly|semiannual|annual. Usage is tracked per
/// cycle in `settings.perkUsage`. Mirrors the web `Card.perks` shape.
public struct CardPerk: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var amount: Double
    public var frequency: String

    public init(id: String, label: String = "", amount: Double = 0, frequency: String = "monthly") {
        self.id = id
        self.label = label
        self.amount = amount
        self.frequency = frequency
    }

    enum CodingKeys: String, CodingKey { case id, label, amount, frequency }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // id may arrive as a number or string from various clients.
        id = c.flexibleString(.id) ?? UUID().uuidString
        label = c.flexibleString(.label) ?? ""
        amount = c.flexibleDouble(.amount) ?? 0
        frequency = c.flexibleString(.frequency) ?? "monthly"
    }
}

/// A card-linked offer (Amex Offers, Chase Offers, BofA Deals…) the user has
/// activated. FiHaven can't auto-activate (issuer APIs are private), so this
/// is a manual tracker keeping the expiry in front of you. `used` is toggled
/// from the Rewards tab. Mirrors the web `Card.offers` shape.
public struct CardOffer: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var merchant: String
    public var detail: String
    public var expires: String   // "YYYY-MM-DD" or "" for no expiry
    public var used: Bool

    public init(id: String, merchant: String = "", detail: String = "", expires: String = "", used: Bool = false) {
        self.id = id
        self.merchant = merchant
        self.detail = detail
        self.expires = expires
        self.used = used
    }

    enum CodingKeys: String, CodingKey { case id, merchant, detail, expires, used }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? UUID().uuidString
        merchant = c.flexibleString(.merchant) ?? ""
        detail = c.flexibleString(.detail) ?? ""
        expires = c.flexibleString(.expires) ?? ""
        used = c.flexibleBool(.used) ?? false
    }
}

/// A credit card, including optional 0%-promo tracking. Shape mirrors the
/// web client (docs/native-contract.md §6).
public struct Card: Codable, Identifiable, Equatable, Sendable {
    public var id: String
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
    public var autopayDay: Int?        // "Autopay day" — day money is pulled; nil falls back to dueDay
    public var notes: String
    public var type: String?           // "card" | "loan"
    public var issuer: String?
    public var currentBalance: Double?
    public var lastDigits: String?
    public var network: String?          // "Visa" | "Mastercard" | "Amex" | "Discover" | …
    public var rewardBase: Double        // flat reward % on everything (rewards optimizer)
    public var rewardCategories: [String: Double]   // per-category reward % overrides
    public var rotatingPool: [String]?   // categories that can earn the elevated rotating rate
    public var rotatingRate: Double?     // elevated rate (e.g. 5) those categories earn when active
    public var pointValue: Double?       // cents per point/mile (nil → 1 = cash back)
    public var perks: [CardPerk]         // recurring statement credits tracked per cycle
    public var annualFee: Double?        // annual fee — powers the "is it worth it?" check
    public var feeMonth: Int?            // month (1–12) the fee renews; nil if unknown
    public var offers: [CardOffer]       // card-linked offers (manual tracker)

    public init(
        id: String,
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
        autopayDay: Int? = nil,
        notes: String = "",
        type: String? = "card",
        issuer: String? = nil,
        currentBalance: Double? = nil,
        lastDigits: String? = nil,
        network: String? = nil,
        rewardBase: Double = 0,
        rewardCategories: [String: Double] = [:],
        rotatingPool: [String]? = nil,
        rotatingRate: Double? = nil,
        pointValue: Double? = nil,
        perks: [CardPerk] = [],
        annualFee: Double? = nil,
        feeMonth: Int? = nil,
        offers: [CardOffer] = []
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
        self.autopayDay = autopayDay
        self.notes = notes
        self.type = type
        self.issuer = issuer
        self.currentBalance = currentBalance
        self.lastDigits = lastDigits
        self.network = network
        self.rewardBase = rewardBase
        self.rewardCategories = rewardCategories
        self.rotatingPool = rotatingPool
        self.rotatingRate = rotatingRate
        self.pointValue = pointValue
        self.perks = perks
        self.annualFee = annualFee
        self.feeMonth = feeMonth
        self.offers = offers
    }

    enum CodingKeys: String, CodingKey {
        case id, name, balance, limit, minPayment, recommendedPayment, regularAPR
        case hasPromo, promoAPR, promoEndDate, promoBalance
        case dueDay, autopay, autopayDay, notes
        case type, issuer, currentBalance, lastDigits, network
        case rewardBase, rewardCategories, rotatingPool, rotatingRate, pointValue, perks
        case annualFee, feeMonth, offers
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
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
        autopayDay = c.flexibleInt(.autopayDay)
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
        rotatingPool = try? c.decode([String].self, forKey: .rotatingPool)
        rotatingRate = c.flexibleDouble(.rotatingRate)
        pointValue = c.flexibleDouble(.pointValue)
        // Tolerate a missing or malformed perks array by falling back to empty.
        perks = (try? c.decode([CardPerk].self, forKey: .perks)) ?? []
        annualFee = c.flexibleDouble(.annualFee)
        feeMonth = c.flexibleInt(.feeMonth)
        offers = (try? c.decode([CardOffer].self, forKey: .offers)) ?? []
    }
}
