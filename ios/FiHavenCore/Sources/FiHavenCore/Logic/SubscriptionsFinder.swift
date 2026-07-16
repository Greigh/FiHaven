import Foundation

/// Subscription finder + manage links — port of subscriptionsFinder.js.
public enum SubscriptionsFinder {
    public static let staleDays = 60
    public static let trialReminderDays = 3

    public struct Item: Identifiable, Equatable, Sendable {
        public var id: String
        public var billId: String?
        public var merchantKey: String
        public var name: String
        public var monthly: Double
        public var amount: Double
        public var source: String
        public var lastDate: String?
        public var priceUp: Double?
        public var stale: Bool
        public var nextDue: Date?
        public var manageUrl: String?
        public var trialEnds: String?
        public var trialDaysLeft: Int?
        public var trialSoon: Bool
        public var duplicate: Bool
    }

    public static let amountSimilarity = 0.15

    public static func monthlyOfBill(_ b: Bill) -> Double {
        switch b.frequency {
        case "Weekly": return b.amount * 52 / 12
        case "Bi-weekly": return b.amount * 26 / 12
        case "Quarterly": return b.amount / 3
        case "Annually": return b.amount / 12
        default: return b.amount
        }
    }

    public static func amountsSimilar(_ amts: [Double]) -> Bool {
        guard amts.count >= 2 else { return true }
        let minA = amts.map { abs($0) }.min() ?? 0
        let maxA = amts.map { abs($0) }.max() ?? 0
        if maxA < 0.005 { return true }
        return (maxA - minA) / maxA <= amountSimilarity
    }

    public static func build(
        bills: [Bill],
        transactions: [SpendTransaction],
        tz: TimeZone,
        declined: [String] = []
    ) -> [Item] {
        let declinedSet = Set(declined.map { $0.lowercased() }.filter { !$0.isEmpty })
        var trackedKeys = Set<String>()
        var out: [Item] = []
        for b in bills where b.category == "Subscriptions" && !b.archived && !DateLogic.billEnded(b, tz: tz) {
            let left = trialDaysLeft(b.trialEnds, tz: tz)
            let name = b.name.isEmpty ? "Subscription" : b.name
            let mk = SubscriptionLinks.normalizeKey(name)
            if !mk.isEmpty { trackedKeys.insert(mk) }
            out.append(Item(
                id: "bill-\(b.id)",
                billId: b.id,
                merchantKey: mk,
                name: name,
                monthly: monthlyOfBill(b),
                amount: b.amount,
                source: "bill",
                lastDate: nil,
                priceUp: nil,
                stale: false,
                nextDue: BillSchedule.nextDueDate(b, tz: tz),
                manageUrl: SubscriptionLinks.manageUrl(for: b),
                trialEnds: b.trialEnds,
                trialDaysLeft: left,
                trialSoon: left.map { $0 >= 0 && $0 <= trialReminderDays } ?? false,
                duplicate: false
            ))
        }
        let withMerchant = transactions.filter { !$0.merchant.trimmingCharacters(in: .whitespaces).isEmpty }
        let byMerchant = Dictionary(grouping: withMerchant) { $0.merchant.trimmingCharacters(in: .whitespaces).lowercased() }
        for (_, list) in byMerchant {
            let months = Set(list.map { String($0.date.prefix(7)) })
            if months.count < 2 || list.count < 2 { continue }
            if months.count < 3 && !amountsSimilar(list.map(\.amount)) { continue }
            let sorted = list.sorted { $0.date < $1.date }
            guard let latest = sorted.last else { continue }
            let minAmt = list.map(\.amount).min() ?? 0
            let days = daysSince(latest.date, tz: tz) ?? 0
            let mk = SubscriptionLinks.normalizeKey(latest.merchant)
            if !mk.isEmpty && (declinedSet.contains(mk) || trackedKeys.contains(mk)) { continue }
            out.append(Item(
                id: "tx-\(latest.merchant)",
                billId: nil,
                merchantKey: mk,
                name: latest.merchant,
                monthly: latest.amount,
                amount: latest.amount,
                source: "tx",
                lastDate: latest.date,
                priceUp: latest.amount > minAmt + 0.005 ? minAmt : nil,
                stale: days > staleDays,
                nextDue: nil,
                manageUrl: SubscriptionLinks.manageUrl(for: Bill(id: "", name: latest.merchant, business: latest.merchant)),
                trialEnds: nil,
                trialDaysLeft: nil,
                trialSoon: false,
                duplicate: false
            ))
        }
        let dupes = duplicateKeys(out)
        return out.map { var i = $0; i.duplicate = dupes.contains(i.id); return i }
            .sorted { $0.monthly > $1.monthly }
    }

    private static func duplicateKeys(_ items: [Item]) -> Set<String> {
        var byKey: [String: [Item]] = [:]
        items.forEach { i in
            let k = SubscriptionLinks.normalizeKey(i.name)
            guard !k.isEmpty else { return }
            byKey[k, default: []].append(i)
        }
        return Set(byKey.filter { $0.value.count > 1 }.flatMap { $0.value.map(\.id) })
    }

    private static func trialDaysLeft(_ trialEnds: String?, tz: TimeZone) -> Int? {
        guard let trialEnds, trialEnds.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let end = DateLogic.parseDate(trialEnds, tz: tz) else { return nil }
        let today = DateLogic.today(tz: tz)
        return Calendar.current.dateComponents([.day], from: today, to: end).day
    }

    private static func daysSince(_ iso: String, tz: TimeZone) -> Int? {
        guard let d = DateLogic.parseDate(iso, tz: tz) else { return nil }
        return Calendar.current.dateComponents([.day], from: d, to: Date()).day
    }
}

public enum SubscriptionLinks {
    private static let urls: [String: String] = [
        "netflix": "https://www.netflix.com/cancelplan",
        "spotify": "https://www.spotify.com/account/subscription/",
        "hulu": "https://secure.hulu.com/account",
        "disneyplus": "https://www.disneyplus.com/account",
        "max": "https://www.max.com/account",
        "amazon": "https://www.amazon.com/gp/mprimecentral",
        "prime": "https://www.amazon.com/gp/mprimecentral",
        "youtube": "https://www.youtube.com/paid_memberships",
        "adobe": "https://account.adobe.com/plans",
    ]

    public static func normalizeKey(_ name: String) -> String {
        name.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "", options: .regularExpression)
    }

    public static func manageUrl(for bill: Bill) -> String? {
        if let u = extractUrl(bill.notes) { return u }
        for raw in [bill.business, bill.name].compactMap({ $0?.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
            let key = normalizeKey(raw)
            if let direct = urls[key] { return direct }
            if let hit = urls.keys.first(where: { key.contains($0) || $0.contains(key) }) { return urls[hit] }
        }
        return nil
    }

    private static func extractUrl(_ notes: String) -> String? {
        guard let m = notes.range(of: #"https?://[^\s]+"#, options: .regularExpression) else { return nil }
        return String(notes[m]).trimmingCharacters(in: CharacterSet(charactersIn: ",.)"))
    }
}
