import Foundation

/// Card credits & perks — recurring statement credits the user logs usage
/// against each cycle. Pure helpers mirroring the web `perks.js` (and
/// Android `Perks.kt`). Usage is stored per (card, perk, cycle) in
/// `settings.perkUsage`; what's left is money on the table.
public enum Perks {
    public static let frequencies = ["monthly", "quarterly", "semiannual", "annual"]

    private static func parts(_ date: Date, _ cal: Calendar) -> (year: Int, month0: Int) {
        let c = cal.dateComponents([.year, .month], from: date)
        return (c.year ?? 1970, (c.month ?? 1) - 1)   // month0 is 0-based
    }

    /// "YYYY-MM" / "YYYY-Qn" / "YYYY-Hn" / "YYYY" for the cycle a date is in.
    public static func cycleKey(_ frequency: String, date: Date, cal: Calendar) -> String {
        let (y, m) = parts(date, cal)
        switch frequency {
        case "quarterly":  return "\(y)-Q\(m / 3 + 1)"
        case "semiannual": return "\(y)-H\(m / 6 + 1)"
        case "annual":     return "\(y)"
        default:           return String(format: "%04d-%02d", y, m + 1)
        }
    }

    /// [start, end) bounds of the cycle a date falls in.
    public static func cycleBounds(_ frequency: String, date: Date, cal: Calendar) -> (start: Date, end: Date) {
        let (y, m) = parts(date, cal)
        func day1(_ year: Int, _ month0: Int) -> Date {
            var c = DateComponents(); c.year = year; c.month = month0 + 1; c.day = 1
            return cal.date(from: c) ?? date
        }
        switch frequency {
        case "quarterly":
            let qm = (m / 3) * 3
            return (day1(y, qm), day1(qm + 3 >= 12 ? y + 1 : y, (qm + 3) % 12))
        case "semiannual":
            let hm = (m / 6) * 6
            return (day1(y, hm), day1(hm + 6 >= 12 ? y + 1 : y, (hm + 6) % 12))
        case "annual":
            return (day1(y, 0), day1(y + 1, 0))
        default:
            return (day1(y, m), day1(m + 1 >= 12 ? y + 1 : y, (m + 1) % 12))
        }
    }

    /// Whole days left in the current cycle (0 on the last day).
    public static func expiresInDays(_ frequency: String, date: Date, cal: Calendar) -> Int {
        let end = cycleBounds(frequency, date: date, cal: cal).end
        let days = cal.dateComponents([.day], from: date, to: end).day ?? 0
        return max(0, days - 1)
    }

    public static func usageKey(cardId: String, perkId: String, frequency: String, date: Date, cal: Calendar) -> String {
        "\(cardId):\(perkId):\(cycleKey(frequency, date: date, cal: cal))"
    }

    public static func used(_ usage: [String: Double], cardId: String, perk: CardPerk, date: Date, cal: Calendar) -> Double {
        usage[usageKey(cardId: cardId, perkId: perk.id, frequency: perk.frequency, date: date, cal: cal)] ?? 0
    }

    public static func remaining(_ usage: [String: Double], cardId: String, perk: CardPerk, date: Date, cal: Calendar) -> Double {
        max(0, perk.amount - min(used(usage, cardId: cardId, perk: perk, date: date, cal: cal), perk.amount))
    }

    /// Dollars unused across every perk on every card.
    public static func unrealizedTotal(_ cards: [Card], usage: [String: Double], date: Date, cal: Calendar) -> Double {
        cards.reduce(0) { sum, c in
            sum + c.perks.reduce(0) { $0 + remaining(usage, cardId: String(c.id), perk: $1, date: date, cal: cal) }
        }
    }

    /// How many times a perk's cycle recurs in a year.
    public static func cyclesPerYear(_ frequency: String) -> Double {
        ["monthly": 12, "quarterly": 4, "semiannual": 2, "annual": 1][frequency] ?? 1
    }

    /// Annual cash value of a card's perks if every credit is fully used.
    public static func annualValue(_ card: Card) -> Double {
        card.perks.reduce(0) { $0 + $1.amount * cyclesPerYear($1.frequency) }
    }

    /// Annualized value of credits actually captured (this cycle's usage taken
    /// as typical, capped at each perk's value).
    public static func capturedAnnual(_ card: Card, usage: [String: Double], date: Date, cal: Calendar) -> Double {
        card.perks.reduce(0) { acc, p in
            let u = min(used(usage, cardId: String(card.id), perk: p, date: date, cal: cal), p.amount)
            return acc + u * cyclesPerYear(p.frequency)
        }
    }

    public enum FeeVerdict: String { case keep, optimize, review }
    public struct FeeAssessment {
        public let fee: Double
        public let potential: Double
        public let captured: Double
        public let rewards: Double   // estimated annual rewards from spend (0 when unknown)
        public let value: Double     // captured perks + rewards
        public let net: Double
        public let verdict: FeeVerdict
    }

    /// "Is this annual fee worth it?" — fee vs. the value the card returns: its
    /// perks (potential + captured) plus an optional estimate of rewards earned
    /// from spend (`rewardsEstimate`, from Rewards.cardRewardsEstimateAnnual).
    /// nil for fee-free cards. With no estimate (0) the verdict is framed on
    /// perks alone, the concrete data we always have.
    public static func feeAssessment(_ card: Card, usage: [String: Double], date: Date, cal: Calendar,
                                     rewardsEstimate: Double = 0) -> FeeAssessment? {
        let fee = card.annualFee ?? 0
        guard fee > 0 else { return nil }
        let potential = annualValue(card)
        let captured = capturedAnnual(card, usage: usage, date: date, cal: cal)
        let rewards = max(0, rewardsEstimate)
        let value = captured + rewards
        let verdict: FeeVerdict = value >= fee ? .keep : (potential + rewards >= fee ? .optimize : .review)
        return FeeAssessment(fee: fee, potential: potential, captured: captured,
                             rewards: rewards, value: value, net: value - fee, verdict: verdict)
    }

    /// Apply a usage edit (clamped to [0, perk amount]) and prune entries from
    /// cycles two+ years old. Returns the new map to store in settings.
    public static func applyUsage(_ usage: [String: Double], cardId: String, perk: CardPerk,
                                  amount: Double, date: Date, cal: Calendar) -> [String: Double] {
        var map = usage
        let clamped = max(0, min(amount, perk.amount))
        let key = usageKey(cardId: cardId, perkId: perk.id, frequency: perk.frequency, date: date, cal: cal)
        if clamped > 0 { map[key] = clamped } else { map.removeValue(forKey: key) }

        let minYear = parts(date, cal).year - 1
        for k in map.keys {
            if let y = Int(k.split(separator: ":").last?.prefix(4) ?? ""), y < minYear {
                map.removeValue(forKey: k)
            }
        }
        return map
    }
}
