import Foundation

/// Card-linked offers tracker — pure helpers mirroring the web `offers.js`
/// (and Android `Offers.kt`). FiHaven can't auto-activate offers (issuer APIs
/// are private), so this just keeps the expiry of offers you've activated in
/// front of you. Offers live on `Card.offers`.
public enum Offers {
    /// Whole days until an offer expires (negative once past); nil with no date.
    public static func daysLeft(_ offer: CardOffer, tz: TimeZone, now: Date = Date()) -> Int? {
        guard let end = DateLogic.parseDate(offer.expires, tz: tz) else { return nil }
        let cal = DateLogic.calendar(tz: tz)
        let today = DateLogic.today(tz: tz, now: now)
        return cal.dateComponents([.day], from: today, to: end).day
    }

    public static func expired(_ offer: CardOffer, tz: TimeZone, now: Date = Date()) -> Bool {
        if let d = daysLeft(offer, tz: tz, now: now) { return d < 0 }
        return false
    }

    /// One entry per card. Active = not used, not expired.
    public struct ActiveOffer: Equatable { public let card: Card; public let offer: CardOffer; public let daysLeft: Int? }

    /// Every still-actionable offer across all cards, soonest expiry first
    /// (no-expiry offers sort last).
    public static func active(_ cards: [Card], tz: TimeZone, now: Date = Date()) -> [ActiveOffer] {
        var out: [ActiveOffer] = []
        for c in cards {
            for o in c.offers where !o.used {
                let d = daysLeft(o, tz: tz, now: now)
                if let d, d < 0 { continue }
                out.append(ActiveOffer(card: c, offer: o, daysLeft: d))
            }
        }
        return out.sorted { a, b in
            switch (a.daysLeft, b.daysLeft) {
            case (nil, _): return false
            case (_, nil): return true
            case let (x?, y?): return x < y
            }
        }
    }

    /// How many active offers expire within `withinDays` (default a week).
    public static func expiringSoon(_ cards: [Card], withinDays: Int = 7, tz: TimeZone, now: Date = Date()) -> Int {
        active(cards, tz: tz, now: now).filter { ($0.daysLeft ?? Int.max) <= withinDays }.count
    }

    // MARK: - Plaid-assisted "looks like you used this" detection

    /// Normalize a merchant string for fuzzy matching: lowercase, alphanumerics
    /// only ("Amex Travel #123" → "amextravel123").
    private static func normMerchant(_ s: String) -> String {
        String(s.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
    }

    /// The most recent transaction that looks like it satisfies `offer`, or nil.
    /// A positive-amount charge whose merchant contains (or is contained by) the
    /// offer's merchant, dated within the last `windowDays` (default 60) and not
    /// in the future. Skips used offers. A SUGGESTION only — the user confirms.
    public static func likelyUsedTx(_ offer: CardOffer, transactions: [SpendTransaction],
                                    tz: TimeZone, now: Date = Date(), windowDays: Int = 60) -> SpendTransaction? {
        guard !offer.used else { return nil }
        let m = normMerchant(offer.merchant)
        guard m.count >= 3 else { return nil }
        let cal = DateLogic.calendar(tz: tz)
        let today = DateLogic.today(tz: tz, now: now)
        guard let start = cal.date(byAdding: .day, value: -windowDays, to: today) else { return nil }
        var best: SpendTransaction?
        var bestDate: Date?
        for t in transactions {
            guard t.amount > 0 else { continue }
            let tm = normMerchant(t.merchant)
            guard tm.count >= 3, tm.contains(m) || m.contains(tm) else { continue }
            guard let td = DateLogic.parseDate(t.date, tz: tz), td >= start, td <= today else { continue }
            if bestDate == nil || td > bestDate! { best = t; bestDate = td }
        }
        return best
    }

    /// One entry per offer.
    public struct UseSuggestion: Equatable { public let card: Card; public let offer: CardOffer; public let tx: SpendTransaction }

    /// For every active (unused, unexpired) offer, any matching transaction that
    /// suggests it was used. Drives the "looks like you used this offer" prompt.
    public static func useSuggestions(_ cards: [Card], transactions: [SpendTransaction], tz: TimeZone, now: Date = Date()) -> [UseSuggestion] {
        var out: [UseSuggestion] = []
        for c in cards {
            for o in c.offers where !o.used {
                if expired(o, tz: tz, now: now) { continue }
                if let tx = likelyUsedTx(o, transactions: transactions, tz: tz, now: now) {
                    out.append(UseSuggestion(card: c, offer: o, tx: tx))
                }
            }
        }
        return out
    }
}
