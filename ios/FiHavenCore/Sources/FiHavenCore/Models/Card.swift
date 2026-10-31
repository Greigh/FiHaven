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

/// A promotional APR window on a card — 0% on purchases, a 4.99%
/// balance-transfer offer, and so on. `balance` is nil unless a positive
/// number: blank means "the card balance the other promos don't claim"
/// (the legacy `promoBalance || balance` meaning, where 0 fell back too).
/// `endDate` nil means the promo has no window and is never "active".
/// Mirrors the web `Card.promos` entries.
public struct CardPromo: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var apr: Double
    public var balance: Double?
    public var endDate: String?   // "YYYY-MM-DD"

    public init(id: String, label: String = "", apr: Double = 0, balance: Double? = nil, endDate: String? = nil) {
        self.id = id
        self.label = label
        self.apr = apr
        self.balance = balance
        self.endDate = endDate
    }

    enum CodingKeys: String, CodingKey { case id, label, apr, balance, endDate }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? UUID().uuidString
        label = c.flexibleString(.label) ?? ""
        apr = c.flexibleDouble(.apr) ?? 0
        // blank/0/unreadable all mean "covers what's left" — see promoBalanceOf.
        if let b = c.flexibleDouble(.balance), b > 0 {
            balance = b
        } else {
            balance = nil
        }
        endDate = c.flexibleString(.endDate)
        if endDate?.isEmpty == true { endDate = nil }
    }
}

/// A credit card, including optional promo-APR tracking. Shape mirrors the
/// web client (docs/native-contract.md §6).
public struct Card: Codable, Identifiable, Equatable, Sendable {
    /// `plaidAccountId` value meaning "never match this card to a bank
    /// account". Clearing the picker back to automatic isn't a refusal — the
    /// next sync just pins the card again — so the no needs somewhere to live,
    /// and it rides in this field because a separate flag would be dropped by
    /// clients that predate it. Kept in sync with NO_LINK in
    /// `server/plaidBalances.js`.
    public static let noPlaidLink = "none"

    public var id: String
    public var name: String
    public var balance: Double
    public var limit: Double
    /// Minimum payment (card) or scheduled monthly payment (loan). **nil means
    /// never filled in**, distinct from an explicit 0 — see `Bill.amount`. Use
    /// `minPaymentOrZero` for arithmetic.
    public var minPayment: Double?
    public var recommendedPayment: Double?   // optional override for the "recommended" payment
    public var regularAPR: Double
    public var hasPromo: Bool
    public var promoAPR: Double?
    public var promoEndDate: String?   // "YYYY-MM-DD"
    public var promoBalance: Double?
    /// Promo APR windows — the multi-promo list that supersedes the legacy
    /// `hasPromo`/`promoAPR`/`promoEndDate`/`promoBalance` fields above.
    /// Those fields are still written (mirrored from the earliest-ending
    /// promo) so older clients see the deadline that matters; readers go
    /// through `promoList`, never the raw fields.
    public var promos: [CardPromo]
    /// Whether `hasPromo` was present in the decoded JSON — distinguishes
    /// an explicit "no promo" from flag-absent data where leftover promo
    /// fields still describe a real window. Set by the decoder; the
    /// memberwise init leaves it true (callers who pass `hasPromo: false`
    /// mean it).
    public var promoFlagPresent: Bool
    /// Set after the paid-off promo clear prompt so we don't ask again.
    public var promoPayoffPrompted: Bool
    public var dueDay: Int?
    public var autopay: Bool
    public var autopayDay: Int?        // "Autopay day" — day money is pulled; nil falls back to dueDay
    public var notes: String
    public var type: String?           // "card" | "loan"
    public var issuer: String?
    public var currentBalance: Double?
    public var lastDigits: String?
    public var network: String?          // "Visa" | "Mastercard" | "Amex" | "Discover" | …
    /// Plaid `accountId` the user pinned this card to in the editor. Set, it
    /// overrides digit matching for balance suggestions and claims that
    /// account's imported transactions. Amex needs it: the mask Plaid reports
    /// is the account's, not the number printed on the card.
    ///
    /// `Card.noPlaidLink` means the opposite — never match this card at all.
    public var plaidAccountId: String?
    public var rewardBase: Double        // flat reward % on everything (rewards optimizer)
    public var rewardCategories: [String: Double]   // per-category reward % overrides
    public var rotatingPool: [String]?   // categories that can earn the elevated rotating rate
    public var rotatingRate: Double?     // elevated rate (e.g. 5) those categories earn when active
    public var pointValue: Double?       // cents per point/mile (nil → 1 = cash back)
    public var presetId: String?         // catalog preset this card was started from
    public var acceptedPresetUpdatedAt: Double?  // last catalog updatedAt the user accepted
    public var declinedPresetUpdatedAt: Double?  // last catalog updatedAt the user declined
    public var perks: [CardPerk]         // recurring statement credits tracked per cycle
    public var annualFee: Double?        // annual fee — powers the "is it worth it?" check
    public var feeMonth: Int?            // month (1–12) the fee renews; nil if unknown
    public var offers: [CardOffer]       // card-linked offers (manual tracker)
    public var rewardsUrl: String?       // User-saved rewards/offers link (rewards panel)
    public var archived: Bool            // Soft delete — hidden from lists/totals, restorable

    public init(
        id: String,
        name: String,
        balance: Double = 0,
        limit: Double = 0,
        minPayment: Double? = nil,
        recommendedPayment: Double? = nil,
        regularAPR: Double = 0,
        hasPromo: Bool = false,
        promoAPR: Double? = nil,
        promoEndDate: String? = nil,
        promoBalance: Double? = nil,
        promos: [CardPromo] = [],
        promoPayoffPrompted: Bool = false,
        dueDay: Int? = nil,
        autopay: Bool = false,
        autopayDay: Int? = nil,
        notes: String = "",
        type: String? = "card",
        issuer: String? = nil,
        currentBalance: Double? = nil,
        lastDigits: String? = nil,
        network: String? = nil,
        plaidAccountId: String? = nil,
        rewardBase: Double = 0,
        rewardCategories: [String: Double] = [:],
        rotatingPool: [String]? = nil,
        rotatingRate: Double? = nil,
        pointValue: Double? = nil,
        presetId: String? = nil,
        acceptedPresetUpdatedAt: Double? = nil,
        declinedPresetUpdatedAt: Double? = nil,
        perks: [CardPerk] = [],
        annualFee: Double? = nil,
        feeMonth: Int? = nil,
        offers: [CardOffer] = [],
        rewardsUrl: String? = nil,
        archived: Bool = false
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
        self.promos = promos
        self.promoFlagPresent = true
        self.promoPayoffPrompted = promoPayoffPrompted
        self.dueDay = dueDay
        self.autopay = autopay
        self.autopayDay = autopayDay
        self.notes = notes
        self.type = type
        self.issuer = issuer
        self.currentBalance = currentBalance
        self.lastDigits = lastDigits
        self.network = network
        self.plaidAccountId = plaidAccountId
        self.rewardBase = rewardBase
        self.rewardCategories = rewardCategories
        self.rotatingPool = rotatingPool
        self.rotatingRate = rotatingRate
        self.pointValue = pointValue
        self.presetId = presetId
        self.acceptedPresetUpdatedAt = acceptedPresetUpdatedAt
        self.declinedPresetUpdatedAt = declinedPresetUpdatedAt
        self.perks = perks
        self.annualFee = annualFee
        self.feeMonth = feeMonth
        self.offers = offers
        self.rewardsUrl = rewardsUrl
        self.archived = archived
    }

    enum CodingKeys: String, CodingKey {
        case id, name, balance, limit, minPayment, recommendedPayment, regularAPR
        case hasPromo, promoAPR, promoEndDate, promoBalance, promos, promoPayoffPrompted
        case dueDay, autopay, autopayDay, notes
        case type, issuer, currentBalance, lastDigits, network, plaidAccountId
        case rewardBase, rewardCategories, rotatingPool, rotatingRate, pointValue, perks
        case presetId, acceptedPresetUpdatedAt, declinedPresetUpdatedAt
        case annualFee, feeMonth, offers, rewardsUrl, archived
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        name = c.flexibleString(.name) ?? ""
        balance = c.flexibleDouble(.balance) ?? 0
        limit = c.flexibleDouble(.limit) ?? 0
        minPayment = c.flexibleDouble(.minPayment)
        recommendedPayment = c.flexibleDouble(.recommendedPayment)
        regularAPR = c.flexibleDouble(.regularAPR) ?? 0
        // flexibleBool returns nil when the key is absent — that absence is
        // meaningful for legacy-promo synthesis (see promoList), so keep it
        // alongside the defaulted flag.
        let decodedHasPromo = c.flexibleBool(.hasPromo)
        hasPromo = decodedHasPromo ?? false
        promoFlagPresent = decodedHasPromo != nil
        promoAPR = c.flexibleDouble(.promoAPR)
        promoEndDate = c.flexibleString(.promoEndDate)
        promoBalance = c.flexibleDouble(.promoBalance)
        // Tolerate a missing or malformed promos array by falling back to empty.
        promos = (try? c.decode([CardPromo].self, forKey: .promos)) ?? []
        promoPayoffPrompted = c.flexibleBool(.promoPayoffPrompted) ?? false
        dueDay = c.flexibleInt(.dueDay)
        autopay = c.flexibleBool(.autopay) ?? false
        autopayDay = c.flexibleInt(.autopayDay)
        notes = c.flexibleString(.notes) ?? ""
        type = c.flexibleString(.type) ?? "card"
        issuer = c.flexibleString(.issuer)
        currentBalance = c.flexibleDouble(.currentBalance)
        lastDigits = c.flexibleString(.lastDigits)
        network = c.flexibleString(.network)
        plaidAccountId = c.flexibleString(.plaidAccountId)
        rewardBase = c.flexibleDouble(.rewardBase) ?? 0
        // Web writes a plain { "Dining": 4 } object of numbers; tolerate a
        // missing or malformed map by falling back to empty.
        rewardCategories = (try? c.decode([String: Double].self, forKey: .rewardCategories)) ?? [:]
        rotatingPool = try? c.decode([String].self, forKey: .rotatingPool)
        rotatingRate = c.flexibleDouble(.rotatingRate)
        pointValue = c.flexibleDouble(.pointValue)
        presetId = c.flexibleString(.presetId)
        acceptedPresetUpdatedAt = c.flexibleDouble(.acceptedPresetUpdatedAt)
        declinedPresetUpdatedAt = c.flexibleDouble(.declinedPresetUpdatedAt)
        // Tolerate a missing or malformed perks array by falling back to empty.
        perks = (try? c.decode([CardPerk].self, forKey: .perks)) ?? []
        annualFee = c.flexibleDouble(.annualFee)
        feeMonth = c.flexibleInt(.feeMonth)
        offers = (try? c.decode([CardOffer].self, forKey: .offers)) ?? []
        rewardsUrl = c.flexibleString(.rewardsUrl)
        archived = c.flexibleBool(.archived) ?? false
    }

    /// The minimum/scheduled payment for arithmetic — a blank one contributes
    /// nothing. Use `minPayment` itself to ask whether one was ever set.
    public var minPaymentOrZero: Double { minPayment ?? 0 }
}

// ── Promos ────────────────────────────────────────────────────────────
// A card can carry several promo windows at once — 0% on purchases plus a
// balance-transfer offer, say — each with its own rate, balance and end
// date. `promos` holds the list; cards saved before it existed carry the
// same data in the legacy fields, so reads synthesize a one-item list and
// every consumer works off the list — the two shapes can never diverge.
// Mirrors cardPromos/promoBalanceOf/promoIsActive/soonestPromo in utils.js.
extension Card {
    /// The card's promo windows: `promos` when non-empty, else a one-item
    /// list synthesized from the legacy fields. A legacy promo exists when
    /// the flag is on, or — with the flag absent from the JSON — when any
    /// legacy field is set; an explicit `hasPromo: false` is the user
    /// saying no (our writers always set the flag).
    public var promoList: [CardPromo] {
        if !promos.isEmpty { return promos }
        let anyField = promoEndDate != nil || promoBalance != nil || promoAPR != nil
        guard hasPromo || (!promoFlagPresent && anyField) else { return [] }
        return [CardPromo(
            id: "legacy",
            apr: promoAPR ?? 0,
            balance: (promoBalance ?? 0) > 0 ? promoBalance : nil,
            endDate: promoEndDate
        )]
    }

    /// The balance a promo actually covers: its stated figure, or — when
    /// blank — the card balance the other promos don't claim. Keeps one
    /// blank-balance promo meaning "the whole card" while two blank rows
    /// can't count the same dollars twice.
    public func promoBalanceOf(_ promo: CardPromo) -> Double {
        if let b = promo.balance { return b }
        let claimed = promoList.reduce(0) { $0 + ($1.balance ?? 0) }
        return max(0, balance - claimed)
    }

    /// The promo whose end date comes first, expired or not — the deadline
    /// a card-level urgency (pill, sort, alert) keys off. nil when no promo
    /// carries an end date.
    public var soonestPromo: CardPromo? {
        promoList
            .filter { $0.endDate?.isEmpty == false }
            .min { ($0.endDate ?? "") < ($1.endDate ?? "") }
    }

    /// Signed days until a promo ends — negative once the window has
    /// closed. nil = no (or unreadable) end date.
    public func promoDaysLeft(_ promo: CardPromo, tz: TimeZone, now: Date = Date()) -> Int? {
        guard let end = DateLogic.parseDate(promo.endDate, tz: tz) else { return nil }
        return DateLogic.calendar(tz: tz)
            .dateComponents([.day], from: DateLogic.today(tz: tz, now: now), to: end).day
    }

    /// Inside its window right now. An unreadable end date counts as
    /// active — dropping the promo would hide it exactly when it needs
    /// attention. Mirrors promoIsActive in utils.js.
    public func promoIsActive(_ promo: CardPromo, tz: TimeZone, now: Date = Date()) -> Bool {
        guard let s = promo.endDate, !s.isEmpty else { return false }
        guard let end = DateLogic.parseDate(s, tz: tz) else { return true }
        return end >= DateLogic.today(tz: tz, now: now)
    }

    public func activePromos(tz: TimeZone, now: Date = Date()) -> [CardPromo] {
        promoList.filter { promoIsActive($0, tz: tz, now: now) }
    }
}
