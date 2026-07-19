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
    public struct CardPreset: Identifiable, Equatable, Sendable, Codable {
        public let id: String
        public let issuer: String
        public let name: String
        public let network: String
        public let rewardBase: Double
        public let rewardCategories: [String: Double]
        public let rotatingRate: Double?     // elevated rate for rotating cards
        public let rotatingPool: [String]?   // categories that can earn it when active
        public let pointValue: Double?       // cents per point (nil → 1 = cash back)
        public let updatedAt: Double?        // catalog stamp from server (ms)
        public var label: String { "\(issuer) \(name)" }
        public init(id: String, issuer: String, name: String, network: String,
                    rewardBase: Double, rewardCategories: [String: Double],
                    rotatingRate: Double? = nil, rotatingPool: [String]? = nil,
                    pointValue: Double? = nil, updatedAt: Double? = nil) {
            self.id = id; self.issuer = issuer; self.name = name; self.network = network
            self.rewardBase = rewardBase; self.rewardCategories = rewardCategories
            self.rotatingRate = rotatingRate; self.rotatingPool = rotatingPool
            self.pointValue = pointValue; self.updatedAt = updatedAt
        }
    }

    /// Bundled defaults. Runtime catalog is `activePresets` (may be replaced from the server).
    public static let cardPresets: [CardPreset] = [
        // American Express
        .init(id: "amex-gold", issuer: "American Express", name: "Gold Card", network: "Amex", rewardBase: 1, rewardCategories: ["Dining": 4, "Groceries": 4, "Travel": 3], pointValue: 2),
        .init(id: "amex-platinum", issuer: "American Express", name: "Platinum Card", network: "Amex", rewardBase: 1, rewardCategories: ["Travel": 5], pointValue: 2),
        .init(id: "amex-green", issuer: "American Express", name: "Green Card", network: "Amex", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3, "Transit": 3], pointValue: 2),
        .init(id: "amex-bcp", issuer: "American Express", name: "Blue Cash Preferred", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 6, "Streaming": 6, "Gas": 3, "Transit": 3]),
        .init(id: "amex-bce", issuer: "American Express", name: "Blue Cash Everyday", network: "Amex", rewardBase: 1, rewardCategories: ["Groceries": 3, "Online shopping": 3, "Gas": 3]),
        // Chase
        .init(id: "chase-csp", issuer: "Chase", name: "Sapphire Preferred", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 2, "Streaming": 3, "Gas": 3], pointValue: 2),
        .init(id: "chase-csr", issuer: "Chase", name: "Sapphire Reserve", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 4], pointValue: 2),
        .init(id: "chase-cfu", issuer: "Chase", name: "Freedom Unlimited", network: "Visa", rewardBase: 1.5, rewardCategories: ["Dining": 3, "Drugstores": 3, "Travel": 5], pointValue: 1.5),
        .init(id: "chase-cff", issuer: "Chase", name: "Freedom Flex", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Drugstores": 3, "Travel": 5], rotatingRate: 5, rotatingPool: ["Gas", "Groceries", "Transit", "Online shopping", "Streaming"], pointValue: 1.5),
        .init(id: "chase-amazon", issuer: "Chase", name: "Amazon Prime Visa", network: "Visa", rewardBase: 1, rewardCategories: ["Online shopping": 5, "Dining": 2, "Gas": 2, "Transit": 2, "Drugstores": 2]),
        .init(id: "chase-southwest-priority", issuer: "Chase", name: "Southwest Priority", network: "Visa", rewardBase: 1, rewardCategories: ["Travel": 4, "Dining": 2, "Gas": 2], pointValue: 1.3),
        // Citi
        .init(id: "citi-double", issuer: "Citi", name: "Double Cash", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "citi-strata", issuer: "Citi", name: "Strata Premier", network: "Mastercard", rewardBase: 1, rewardCategories: ["Travel": 3, "Dining": 3, "Groceries": 3, "Gas": 3], pointValue: 1.8),
        .init(id: "citi-strata-elite", issuer: "Citi", name: "Strata Elite", network: "Mastercard", rewardBase: 1.5, rewardCategories: ["Dining": 3, "Travel": 3], pointValue: 1.8),
        .init(id: "citi-custom-cash", issuer: "Citi", name: "Custom Cash", network: "Mastercard", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Dining", "Groceries", "Gas", "Travel", "Transit", "Streaming", "Drugstores"]),
        .init(id: "citi-costco", issuer: "Citi", name: "Costco Anywhere Visa", network: "Visa", rewardBase: 1, rewardCategories: ["Gas": 4, "Dining": 3, "Travel": 3]),
        // Capital One
        .init(id: "capone-savorone", issuer: "Capital One", name: "SavorOne", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Streaming": 3, "Groceries": 3]),
        .init(id: "capone-savor", issuer: "Capital One", name: "Savor", network: "Mastercard", rewardBase: 1, rewardCategories: ["Dining": 3, "Streaming": 3, "Groceries": 3]),
        .init(id: "capone-quicksilver", issuer: "Capital One", name: "Quicksilver", network: "Mastercard", rewardBase: 1.5, rewardCategories: [:]),
        .init(id: "capone-ventureone", issuer: "Capital One", name: "VentureOne", network: "Visa", rewardBase: 1.25, rewardCategories: ["Travel": 5], pointValue: 1.85),
        .init(id: "capone-venture", issuer: "Capital One", name: "Venture", network: "Visa", rewardBase: 2, rewardCategories: ["Travel": 5], pointValue: 1.85),
        .init(id: "capone-venturex", issuer: "Capital One", name: "Venture X", network: "Visa", rewardBase: 2, rewardCategories: ["Travel": 5], pointValue: 1.85),
        // Wells Fargo
        .init(id: "wf-active-cash", issuer: "Wells Fargo", name: "Active Cash", network: "Visa", rewardBase: 2, rewardCategories: [:]),
        .init(id: "wf-autograph", issuer: "Wells Fargo", name: "Autograph", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 3, "Travel": 3, "Gas": 3, "Transit": 3, "Streaming": 3], pointValue: 1.5),
        .init(id: "wf-autograph-journey", issuer: "Wells Fargo", name: "Autograph Journey", network: "Visa", rewardBase: 1, rewardCategories: ["Travel": 4, "Dining": 3], pointValue: 1.5),
        // Bank of America
        .init(id: "boa-customized", issuer: "Bank of America", name: "Customized Cash", network: "Visa", rewardBase: 1, rewardCategories: ["Gas": 3, "Online shopping": 3]),
        .init(id: "boa-travel", issuer: "Bank of America", name: "Travel Rewards", network: "Visa", rewardBase: 1.5, rewardCategories: [:]),
        .init(id: "boa-premium", issuer: "Bank of America", name: "Premium Rewards", network: "Visa", rewardBase: 1.5, rewardCategories: ["Travel": 2, "Dining": 2]),
        // U.S. Bank
        .init(id: "usbank-altitude-go", issuer: "U.S. Bank", name: "Altitude Go", network: "Visa", rewardBase: 1, rewardCategories: ["Dining": 4, "Streaming": 3, "Groceries": 2, "Gas": 2]),
        .init(id: "usbank-altitude-connect", issuer: "U.S. Bank", name: "Altitude Connect", network: "Visa", rewardBase: 1, rewardCategories: ["Travel": 4, "Gas": 4, "Dining": 2, "Streaming": 2, "Groceries": 2], pointValue: 1),
        .init(id: "usbank-cashplus", issuer: "U.S. Bank", name: "Cash+", network: "Visa", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Gas", "Streaming", "Groceries", "Online shopping", "Transit", "Drugstores"]),
        // Discover
        .init(id: "discover-it", issuer: "Discover", name: "it Cash Back", network: "Discover", rewardBase: 1, rewardCategories: [:], rotatingRate: 5, rotatingPool: ["Gas", "Groceries", "Dining", "Online shopping", "Transit", "Drugstores"]),
        .init(id: "discover-it-miles", issuer: "Discover", name: "it Miles", network: "Discover", rewardBase: 1.5, rewardCategories: [:], pointValue: 1),
        // Bilt 2.0
        .init(id: "bilt-blue", issuer: "Bilt", name: "Blue Card", network: "Mastercard", rewardBase: 1, rewardCategories: ["Travel": 2, "Transit": 3], pointValue: 2.2),
        .init(id: "bilt-obsidian", issuer: "Bilt", name: "Obsidian Card", network: "Mastercard", rewardBase: 1, rewardCategories: ["Travel": 2], rotatingRate: 3, rotatingPool: ["Dining", "Groceries"], pointValue: 2.2),
        .init(id: "bilt-palladium", issuer: "Bilt", name: "Palladium Card", network: "Mastercard", rewardBase: 2, rewardCategories: ["Travel": 3, "Transit": 4], pointValue: 2.2),
        // Co-brand / other
        .init(id: "apple-card", issuer: "Apple", name: "Apple Card", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "amex-hilton-surpass", issuer: "American Express", name: "Hilton Honors Surpass", network: "Amex", rewardBase: 1, rewardCategories: ["Travel": 12, "Dining": 6, "Groceries": 6, "Gas": 6], pointValue: 0.6),
        .init(id: "robinhood-gold", issuer: "Robinhood", name: "Gold Card", network: "Mastercard", rewardBase: 3, rewardCategories: [:]),
        .init(id: "fidelity", issuer: "Fidelity", name: "Rewards Visa", network: "Visa", rewardBase: 2, rewardCategories: [:]),
        .init(id: "sofi", issuer: "SoFi", name: "SoFi Credit Card", network: "Mastercard", rewardBase: 2, rewardCategories: [:]),
        .init(id: "paypal", issuer: "PayPal", name: "Cashback Mastercard", network: "Mastercard", rewardBase: 1.5, rewardCategories: ["Online shopping": 3]),
        .init(id: "target-redcard", issuer: "Target", name: "RedCard", network: "Mastercard", rewardBase: 1, rewardCategories: ["Other": 5]),
    ]

    /// Runtime catalog (server copy when available). Falls back to bundled defaults.
    private static let presetLock = NSLock()
    nonisolated(unsafe) private static var _activePresets: [CardPreset]?
    public static var activePresets: [CardPreset] {
        presetLock.lock(); defer { presetLock.unlock() }
        return _activePresets ?? cardPresets
    }

    /// Replace the in-memory catalog with the server copy (admin-editable).
    public static func replaceActivePresets(_ list: [CardPreset]) {
        presetLock.lock(); defer { presetLock.unlock() }
        _activePresets = list.isEmpty ? nil : list
    }

    public static func presetById(_ id: String) -> CardPreset? {
        activePresets.first { $0.id == id }
    }

    /// Best-effort preset match from a typed card name (and optional issuer).
    public static func suggestCardPreset(name: String, issuer: String = "") -> CardPreset? {
        let q = "\(name) \(issuer)".trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return nil }
        var best: CardPreset?
        var bestScore = 0
        for p in activePresets {
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

    public struct ShippedRate {
        public let rate: Double?
        public let preset: CardPreset?
        public init(rate: Double?, preset: CardPreset?) {
            self.rate = rate
            self.preset = preset
        }
    }

    /// Rate FiHaven ships for a card+category (shared preset catalog — not the
    /// user's possibly-edited local card).
    public static func shippedRewardRate(
        for card: Card,
        category: String,
        baseLabel: String = "Base rate (everything)"
    ) -> ShippedRate {
        let preset: CardPreset?
        if let id = card.presetId, let byId = presetById(id) {
            preset = byId
        } else {
            preset = suggestCardPreset(name: card.name, issuer: card.issuer ?? "")
        }
        guard let preset else { return ShippedRate(rate: nil, preset: nil) }
        if category == baseLabel {
            return ShippedRate(rate: preset.rewardBase, preset: preset)
        }
        if let v = preset.rewardCategories[category] {
            return ShippedRate(rate: v, preset: preset)
        }
        if let pool = preset.rotatingPool, pool.contains(category), let r = preset.rotatingRate {
            return ShippedRate(rate: r, preset: preset)
        }
        return ShippedRate(rate: nil, preset: preset)
    }

    public struct PendingPresetUpdate: Identifiable, Equatable, Sendable {
        public var id: String { card.id }
        public let card: Card
        public let preset: CardPreset
        public init(card: Card, preset: CardPreset) {
            self.card = card; self.preset = preset
        }
    }

    private static func numOr(_ v: Double?, _ fallback: Double) -> Double { v ?? fallback }

    private static func catsEqual(_ a: [String: Double], _ b: [String: Double]) -> Bool {
        let keys = Set(a.keys).union(b.keys)
        for k in keys {
            if numOr(a[k], 0) != numOr(b[k], 0) { return false }
        }
        return true
    }

    /// True when the card's earn rates match the catalog preset.
    public static func cardRatesMatchPreset(_ card: Card, _ preset: CardPreset) -> Bool {
        if numOr(card.rewardBase, 0) != numOr(preset.rewardBase, 0) { return false }
        if numOr(card.pointValue, 1) != numOr(preset.pointValue, 1) { return false }
        if !catsEqual(card.rewardCategories, preset.rewardCategories) { return false }
        let poolA = (card.rotatingPool ?? []).sorted().joined(separator: "|")
        let poolB = (preset.rotatingPool ?? []).sorted().joined(separator: "|")
        if poolA != poolB { return false }
        if !poolA.isEmpty && numOr(card.rotatingRate, 5) != numOr(preset.rotatingRate, 5) { return false }
        return true
    }

    /// Copy catalog earn rates onto a card (does not touch identity fields).
    public static func applyPresetRates(_ card: Card, _ preset: CardPreset) -> Card {
        var next = card
        next.rewardBase = preset.rewardBase
        next.rewardCategories = preset.rewardCategories
        next.pointValue = preset.pointValue
        next.rotatingPool = preset.rotatingPool
        next.rotatingRate = (preset.rotatingPool?.isEmpty == false) ? (preset.rotatingRate ?? 5) : nil
        next.presetId = preset.id
        if let u = preset.updatedAt { next.acceptedPresetUpdatedAt = u }
        // Accepting catalog rates clears any prior "Keep mine" for this (or older) stamp.
        next.declinedPresetUpdatedAt = nil
        return next
    }

    /// Resolve the catalog preset for a user card; optionally attach presetId when rates match.
    public static func resolveCardPreset(_ card: inout Card, attachIfMatch: Bool = false) -> CardPreset? {
        if (card.type ?? "card") == "loan" { return nil }
        var preset: CardPreset?
        if let id = card.presetId { preset = presetById(id) }
        if preset == nil { preset = suggestCardPreset(name: card.name, issuer: card.issuer ?? "") }
        if attachIfMatch, let preset, card.presetId == nil, cardRatesMatchPreset(card, preset) {
            card.presetId = preset.id
            if let u = preset.updatedAt { card.acceptedPresetUpdatedAt = u }
        }
        return preset
    }

    /// Cards whose linked catalog preset has newer rates the user hasn't accepted or declined.
    /// Quietly stamps acceptance when rates already match; mutates `cards` for those stamps.
    public static func findPendingPresetUpdates(_ cards: inout [Card]) -> [PendingPresetUpdate] {
        var out: [PendingPresetUpdate] = []
        for i in cards.indices {
            if cards[i].archived || (cards[i].type ?? "card") == "loan" { continue }
            guard let preset = resolveCardPreset(&cards[i], attachIfMatch: true),
                  cards[i].presetId != nil else { continue }
            if cardRatesMatchPreset(cards[i], preset) {
                if let u = preset.updatedAt,
                   cards[i].acceptedPresetUpdatedAt == nil || (cards[i].acceptedPresetUpdatedAt ?? 0) < u {
                    cards[i].acceptedPresetUpdatedAt = u
                }
                continue
            }
            let updatedAt = preset.updatedAt ?? 0
            if updatedAt > 0, let d = cards[i].declinedPresetUpdatedAt, d >= updatedAt { continue }
            if updatedAt > 0, let a = cards[i].acceptedPresetUpdatedAt, a >= updatedAt { continue }
            if updatedAt == 0, cards[i].declinedPresetUpdatedAt == 0 { continue }
            out.append(PendingPresetUpdate(card: cards[i], preset: preset))
        }
        return out
    }

    public static func formatRateDiff(card: Card, preset: CardPreset) -> String {
        var lines: [String] = []
        let baseA = numOr(card.rewardBase, 0), baseB = numOr(preset.rewardBase, 0)
        if baseA != baseB { lines.append("Base: \(baseA)% → \(baseB)%") }
        let keys = Set(card.rewardCategories.keys).union(preset.rewardCategories.keys)
        for k in keys.sorted() {
            let a = numOr(card.rewardCategories[k], 0)
            let b = numOr(preset.rewardCategories[k], 0)
            if a != b {
                let aLabel = a == 0 ? "—" : "\(a)"
                let bLabel = b == 0 ? "—" : "\(b)"
                lines.append("\(k): \(aLabel)% → \(bLabel)%")
            }
        }
        let ptsA = numOr(card.pointValue, 1), ptsB = numOr(preset.pointValue, 1)
        if ptsA != ptsB { lines.append("Point value: \(ptsA)¢ → \(ptsB)¢") }
        let shown = Array(lines.prefix(8))
        return shown.joined(separator: "\n") + (lines.count > 8 ? "\n…" : "")
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
