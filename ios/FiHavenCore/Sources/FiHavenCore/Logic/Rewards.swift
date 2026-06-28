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
        public let rate: Double         // raw multiplier (points per dollar)
        public let pointValue: Double   // cents per point/mile
        public let value: Double        // cash-equivalent return = rate × pointValue
        public let reason: String?      // why it was excluded, if it was
        public var id: String { card.id }
        public init(card: Card, rate: Double, pointValue: Double = 1, value: Double? = nil, reason: String? = nil) {
            self.card = card; self.rate = rate; self.pointValue = pointValue
            self.value = value ?? (rate * pointValue); self.reason = reason
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
        public let rotatingRate: Double?     // elevated rate for rotating cards
        public let rotatingPool: [String]?   // categories that can earn it when active
        public let pointValue: Double?       // cents per point (nil → 1 = cash back)
        public var label: String { "\(issuer) \(name)" }
        public init(id: String, issuer: String, name: String, network: String,
                    rewardBase: Double, rewardCategories: [String: Double],
                    rotatingRate: Double? = nil, rotatingPool: [String]? = nil,
                    pointValue: Double? = nil) {
            self.id = id; self.issuer = issuer; self.name = name; self.network = network
            self.rewardBase = rewardBase; self.rewardCategories = rewardCategories
            self.rotatingRate = rotatingRate; self.rotatingPool = rotatingPool
            self.pointValue = pointValue
        }
    }

    public static let cardPresets: [CardPreset] = [
        // American Express
        .init(id: "amex-gold", issuer: "American Express", name: "Gold Card", network: "Amex", rewardBase: 1, rewardCategories: ["Dining": 4, "Groceries": 4, "Travel": 3], pointValue: 2),
        .init(id: "amex-platinum", issuer: "American Express", name: "Platinum Card", network: "Amex", rewardBase: 1, rewardCategories: ["Travel": 5], pointValue: 2),
        .init(id: "amex-green", issuer: "American Express", name: "Green Card", network: "Amex", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3, "Transit": 3], pointValue: 2),
        .init(id: "amex-bcp", issuer: "American Express", name: "Blue Cash Preferred", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 6, "Streaming": 6, "Gas": 3, "Transit": 3]),
        .init(id: "amex-bce", issuer: "American Express", name: "Blue Cash Everyday", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 3, "Online shopping": 3, "Gas": 3]),
        // Chase
        .init(id: "chase-csp", issuer: "Chase", name: "Sapphire Preferred", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 2, "Streaming": 3, "Online shopping": 3], pointValue: 2),
        .init(id: "chase-csr", issuer: "Chase", name: "Sapphire Reserve", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3], pointValue: 2),
        .init(id: "chase-cfu", issuer: "Chase", name: "Freedom Unlimited", network: "Visa", rewardBase: 1.5, rewardCategories: ["Dining": 3, "Drugstores": 3, "Travel": 5], pointValue: 1.5),
        .init(id: "chase-cff", issuer: "Chase", name: "Freedom Flex", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Drugstores": 3, "Travel": 5], rotatingRate: 5, rotatingPool: ["Gas", "Groceries", "Transit", "Online shopping", "Streaming"], pointValue: 1.5),
        .init(id: "chase-amazon", issuer: "Chase", name: "Amazon Prime Visa", network: "Visa", rewardBase: 1, rewardCategories: ["Online shopping": 5, "Dining": 2, "Gas": 2, "Transit": 2, "Drugstores": 2]),
        // Citi
        .init(id: "citi-double", issuer: "Citi", name: "Double Cash", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "citi-strata", issuer: "Citi", name: "Strata Premier", network: "Mastercard", rewardBase: 1, rewardCategories: ["Travel": 3, "Dining": 3, "Groceries": 3, "Gas": 3], pointValue: 1.8),
        .init(id: "citi-custom-cash", issuer: "Citi", name: "Custom Cash", network: "Mastercard", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Dining", "Groceries", "Gas", "Travel", "Transit", "Streaming", "Drugstores"]),
        .init(id: "citi-costco", issuer: "Citi", name: "Costco Anywhere Visa", network: "Visa", rewardBase: 1, rewardCategories: ["Gas": 4, "Dining": 3, "Travel": 3]),
        // Capital One
        .init(id: "capone-savorone", issuer: "Capital One", name: "SavorOne", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Streaming": 3, "Groceries": 3]),
        .init(id: "capone-savor", issuer: "Capital One", name: "Savor", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Streaming": 3, "Groceries": 3]),
        .init(id: "capone-quicksilver", issuer: "Capital One", name: "Quicksilver", network: "Mastercard", rewardBase: 1.5, rewardCategories: [:]),
        .init(id: "capone-venture", issuer: "Capital One", name: "Venture", network: "Visa", rewardBase: 2, rewardCategories: ["Travel": 5], pointValue: 1.85),
        .init(id: "capone-venturex", issuer: "Capital One", name: "Venture X", network: "Visa", rewardBase: 2, rewardCategories: ["Travel": 5], pointValue: 1.85),
        // Wells Fargo
        .init(id: "wf-active-cash", issuer: "Wells Fargo", name: "Active Cash", network: "Visa", rewardBase: 2, rewardCategories: [:]),
        .init(id: "wf-autograph", issuer: "Wells Fargo", name: "Autograph", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3, "Gas": 3, "Transit": 3, "Streaming": 3], pointValue: 1.5),
        // Bank of America
        .init(id: "boa-customized", issuer: "Bank of America", name: "Customized Cash", network: "Visa", rewardBase: 1, rewardCategories: ["Gas": 3, "Online shopping": 3]),
        .init(id: "boa-travel", issuer: "Bank of America", name: "Travel Rewards", network: "Visa", rewardBase: 1.5, rewardCategories: [:]),
        .init(id: "boa-premium", issuer: "Bank of America", name: "Premium Rewards", network: "Visa", rewardBase: 1.5, rewardCategories: ["Travel": 2, "Dining": 2]),
        // U.S. Bank
        .init(id: "usbank-altitude-go", issuer: "U.S. Bank", name: "Altitude Go", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 4, "Streaming": 3, "Groceries": 2, "Gas": 2]),
        .init(id: "usbank-cashplus", issuer: "U.S. Bank", name: "Cash+", network: "Visa", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Gas", "Streaming", "Groceries", "Online shopping", "Transit", "Drugstores"]),
        // Discover
        .init(id: "discover-it", issuer: "Discover", name: "it Cash Back", network: "Discover", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Gas", "Groceries", "Dining", "Online shopping", "Transit", "Drugstores"]),
        // Other
        .init(id: "apple-card", issuer: "Apple", name: "Apple Card", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "bilt", issuer: "Bilt", name: "Bilt Mastercard", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 2], pointValue: 2.2),
        .init(id: "sofi", issuer: "SoFi", name: "SoFi Credit Card", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "paypal", issuer: "PayPal", name: "Cashback Mastercard", network: "Mastercard", rewardBase: 1.5, rewardCategories: ["Online shopping": 3]),
        .init(id: "target-redcard", issuer: "Target", name: "RedCard", network: "Mastercard", rewardBase: 1, rewardCategories: ["Other": 5]),
    ]

    /// Best-effort preset match from a typed card name (and optional issuer).
    public static func suggestCardPreset(name: String, issuer: String = "") -> CardPreset? {
        let q = "\(name) \(issuer)".trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return nil }
        var best: CardPreset?
        var bestScore = 0
        for p in cardPresets {
            var score = 0
            let pn = p.name.lowercased()
            let pi = p.issuer.lowercased()
            let full = "\(pi) \(pn)"
            if q == pn || q == full { score += 20 }
            if q.contains(pn) || pn.contains(q) { score += 10 }
            if !issuer.isEmpty && pi.contains(issuer.lowercased()) { score += 5 }
            for t in q.split(separator: " ") where t.count >= 3 {
                if pn.contains(t) || pi.contains(t) { score += 2 }
            }
            if score > bestScore { bestScore = score; best = p }
        }
        return bestScore >= 4 ? best : nil
    }

    /// A card's reward rate for a category: the per-category multiplier when
    /// set (> 0), otherwise the flat base rate.
    public static func effectiveRate(_ card: Card, category: String) -> Double {
        if let v = card.rewardCategories[category], v > 0 { return v }
        return card.rewardBase
    }

    /// Cents per point/mile (nil/≤0 → 1 = cash back). Points currencies are
    /// worth more than a cent when redeemed well.
    public static func pointValue(_ card: Card) -> Double {
        if let v = card.pointValue, v > 0 { return v }
        return 1
    }

    /// Cash-equivalent return % for a category: multiplier × point value.
    public static func effectiveValue(_ card: Card, category: String) -> Double {
        effectiveRate(card, category: category) * pointValue(card)
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
            let pv = pointValue(c)
            if inActivePromo(c, tz: tz, now: now) {
                excluded.append(Ranked(card: c, rate: rate, pointValue: pv, value: rate * pv, reason: promoReason(c, tz: tz)))
            } else {
                eligible.append(Ranked(card: c, rate: rate, pointValue: pv, value: rate * pv))
            }
        }
        eligible.sort { $0.value > $1.value }
        excluded.sort { $0.value > $1.value }
        return Ranking(eligible: eligible, excluded: excluded)
    }

    private static func trimRate(_ n: Double) -> String {
        let r = (n * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    /// A short "why this card" line for a category: category bonus vs. flat
    /// base, and (for points cards) the multiplier × point-value cash return.
    public static func explanation(_ card: Card, category: String) -> String {
        let rate = effectiveRate(card, category: category)
        if rate <= 0 { return "No reward rate set" }
        let override = card.rewardCategories[category] ?? 0
        let isBonus = override > 0 && override != card.rewardBase
        let where_ = isBonus ? "on \(category.lowercased())" : "on everything"
        let pv = pointValue(card)
        if pv != 1 {
            return "\(trimRate(rate))× points · \(trimRate(pv))¢/pt = \(trimRate(rate * pv))% back \(where_)"
        }
        return "\(trimRate(rate))% back \(where_)"
    }

    /// One entry per category — the single best eligible card (nil when no
    /// card earns anything there). The whole-wallet "best card for each" view.
    public struct WalletPick { public let category: String; public let best: Ranked? }
    public static func walletStrategy(_ cards: [Card], categories: [String], tz: TimeZone, now: Date = Date()) -> [WalletPick] {
        categories.map { cat in
            let top = rank(cards, category: cat, tz: tz, now: now).eligible.first
            return WalletPick(category: cat, best: (top?.value ?? 0) > 0 ? top : nil)
        }
    }

    // MARK: - Spend-based rewards estimate (feeds the annual-fee verdict)

    /// Which reward category a transaction counts toward: a merchant-name hint
    /// first, then the transaction's own category if it's a reward category,
    /// else "Other".
    public static func txRewardCategory(_ t: SpendTransaction) -> String {
        if let hint = Merchants.category(t.merchant) { return hint }
        if categories.contains(t.category) { return t.category }
        return "Other"
    }

    /// Annualized spend per reward category from the user's transactions over
    /// the trailing year. Annualizes by the span of data present (clamped so a
    /// few days can't extrapolate to a wild yearly figure). Empty when there's
    /// nothing to go on. Only positive-amount outflows count.
    public static func categorySpendAnnual(_ transactions: [SpendTransaction], tz: TimeZone, now: Date = Date()) -> [String: Double] {
        let cal = DateLogic.calendar(tz: tz)
        let today = DateLogic.today(tz: tz, now: now)
        guard let yearAgo = cal.date(byAdding: .day, value: -365, to: today) else { return [:] }
        var recent: [(amt: Double, date: Date, tx: SpendTransaction)] = []
        for t in transactions {
            guard t.amount > 0, let d = DateLogic.parseDate(t.date, tz: tz) else { continue }
            if d < yearAgo || d > today { continue }
            recent.append((t.amount, d, t))
        }
        guard !recent.isEmpty else { return [:] }
        let minDate = recent.map { $0.date }.min() ?? today
        let rawSpan = cal.dateComponents([.day], from: minDate, to: today).day ?? 0
        let spanDays = Double(max(30, rawSpan))
        let factor = 365.0 / spanDays
        var totals: [String: Double] = [:]
        for r in recent { totals[txRewardCategory(r.tx), default: 0] += r.amt }
        var out: [String: Double] = [:]
        for (cat, sum) in totals { out[cat] = (sum * factor).rounded() }
        return out
    }

    /// Estimated annual rewards a card earns, given annualized category spend.
    /// Only the card's BONUS categories count (rate beats base) — the spend
    /// you'd realistically route here — so the estimate stays honest. Loans
    /// earn nothing. Result is a cash figure (cents-per-point folded in).
    public static func cardRewardsEstimateAnnual(_ card: Card, spendByCategory: [String: Double]) -> Double {
        if (card.type ?? "card") == "loan" { return 0 }
        let base = card.rewardBase
        var total = 0.0
        for (cat, spend) in spendByCategory where spend > 0 {
            let override = card.rewardCategories[cat] ?? 0
            if override > 0 && override > base {
                total += (spend * effectiveValue(card, category: cat)) / 100  // effectiveValue is a % return
            }
        }
        return total.rounded()
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
