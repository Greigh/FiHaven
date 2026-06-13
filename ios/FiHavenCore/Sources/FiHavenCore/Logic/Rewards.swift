import Foundation

/// "Which card should I use?" optimizer. Mirrors client/js/rewards.js.
///
/// A card inside an active 0% promo window is deliberately EXCLUDED from
/// recommendations: the payoff engine pays 0% balances last, so new rewards
/// spend there grows untouched and starts accruing interest once the promo
/// ends — no reward rate is worth that.
public enum Rewards {
    /// Spending categories offered by the optimizer (kept in sync with the
    /// web's REWARD_CATEGORIES and Android's Rewards.CATEGORIES).
    public static let categories = [
        "Dining", "Groceries", "Gas", "Travel",
        "Transit", "Online shopping", "Streaming", "Drugstores", "Other",
    ]

    /// One card ranked for a category.
    public struct Ranked: Identifiable, Equatable, Sendable {
        public let card: Card
        public let rate: Double
        public let reason: String?   // why it was excluded, if it was
        public var id: Int { card.id }
        public init(card: Card, rate: Double, reason: String? = nil) {
            self.card = card; self.rate = rate; self.reason = reason
        }
    }

    public struct Ranking: Equatable, Sendable {
        public let eligible: [Ranked]
        public let excluded: [Ranked]
    }

    /// A popular card the user can pick to auto-fill its reward profile.
    /// Rates are typical 2025 published defaults and stay editable after import.
    /// Mirrors CARD_PRESETS in client/js/cardPresets.js.
    public struct CardPreset: Identifiable, Equatable, Sendable {
        public let id: String
        public let issuer: String
        public let name: String
        public let network: String
        public let rewardBase: Double
        public let rewardCategories: [String: Double]
        public var label: String { "\(issuer) \(name)" }
    }

    public static let cardPresets: [CardPreset] = [
        .init(id: "amex-gold", issuer: "American Express", name: "Gold Card", network: "Amex", rewardBase: 1, rewardCategories: ["Dining": 4, "Groceries": 4, "Travel": 3]),
        .init(id: "amex-bcp", issuer: "American Express", name: "Blue Cash Preferred", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 6, "Streaming": 6, "Gas": 3, "Transit": 3]),
        .init(id: "amex-bce", issuer: "American Express", name: "Blue Cash Everyday", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 3, "Online shopping": 3, "Gas": 3]),
        .init(id: "chase-csp", issuer: "Chase", name: "Sapphire Preferred", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 2, "Streaming": 3, "Online shopping": 3]),
        .init(id: "chase-csr", issuer: "Chase", name: "Sapphire Reserve", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3]),
        .init(id: "chase-cfu", issuer: "Chase", name: "Freedom Unlimited", network: "Visa", rewardBase: 1.5, rewardCategories: ["Dining": 3, "Drugstores": 3, "Travel": 5]),
        .init(id: "citi-double", issuer: "Citi", name: "Double Cash", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "capone-savorone", issuer: "Capital One", name: "SavorOne", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Streaming": 3, "Groceries": 3]),
        .init(id: "capone-quicksilver", issuer: "Capital One", name: "Quicksilver", network: "Mastercard", rewardBase: 1.5, rewardCategories: [:]),
        .init(id: "capone-venture", issuer: "Capital One", name: "Venture", network: "Visa", rewardBase: 2, rewardCategories: ["Travel": 5]),
        .init(id: "wf-active-cash", issuer: "Wells Fargo", name: "Active Cash", network: "Visa", rewardBase: 2, rewardCategories: [:]),
        .init(id: "wf-autograph", issuer: "Wells Fargo", name: "Autograph", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3, "Gas": 3, "Transit": 3, "Streaming": 3]),
        .init(id: "discover-it", issuer: "Discover", name: "it Cash Back", network: "Discover", rewardBase: 1, rewardCategories: [:]),
        .init(id: "apple-card", issuer: "Apple", name: "Apple Card", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "usbank-altitude-go", issuer: "U.S. Bank", name: "Altitude Go", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 4, "Streaming": 3, "Groceries": 2, "Gas": 2]),
        .init(id: "boa-customized", issuer: "Bank of America", name: "Customized Cash", network: "Visa", rewardBase: 1, rewardCategories: ["Gas": 3, "Online shopping": 3]),
    ]

    /// A card's reward rate for a category: the per-category multiplier when
    /// set (> 0), otherwise the flat base rate.
    public static func effectiveRate(_ card: Card, category: String) -> Double {
        if let v = card.rewardCategories[category], v > 0 { return v }
        return card.rewardBase
    }

    /// True while a card is inside an active 0% promo window (today < end).
    public static func inActivePromo(_ card: Card, tz: TimeZone, now: Date = Date()) -> Bool {
        guard card.hasPromo, let end = DateLogic.parseDate(card.promoEndDate, tz: tz) else { return false }
        return end >= DateLogic.today(tz: tz, now: now)
    }

    /// Rank cards for a spending category. Loans never earn rewards and are
    /// dropped; cards in an active 0% promo go to `excluded` with a reason.
    public static func rank(_ cards: [Card], category: String, tz: TimeZone, now: Date = Date()) -> Ranking {
        var eligible: [Ranked] = []
        var excluded: [Ranked] = []
        for c in cards {
            if (c.type ?? "card") == "loan" { continue }
            let rate = effectiveRate(c, category: category)
            if inActivePromo(c, tz: tz, now: now) {
                excluded.append(Ranked(card: c, rate: rate, reason: promoReason(c, tz: tz)))
            } else {
                eligible.append(Ranked(card: c, rate: rate))
            }
        }
        eligible.sort { $0.rate > $1.rate }
        excluded.sort { $0.rate > $1.rate }
        return Ranking(eligible: eligible, excluded: excluded)
    }

    private static func promoReason(_ card: Card, tz: TimeZone) -> String {
        let label: String
        if let end = DateLogic.parseDate(card.promoEndDate, tz: tz) {
            let f = DateFormatter()
            f.dateFormat = "MMM yyyy"
            f.timeZone = tz
            label = "0% promo until \(f.string(from: end))"
        } else {
            label = "its 0% promo"
        }
        return "\(label) — new spend isn’t prioritized for payoff and can accrue interest later."
    }
}
