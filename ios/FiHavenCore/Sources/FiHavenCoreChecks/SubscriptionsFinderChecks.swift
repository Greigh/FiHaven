import Foundation
import FiHavenCore

/// Mirrors SubscriptionsFinderTest.kt and client/js/subscriptionsFinder.test.js.
/// `build` reads the wall clock through DateLogic.today (there is no injectable
/// `now`), so every date here is relative to the real today — a fixed calendar
/// date would rot.
func runSubscriptionsFinderChecks() {
    let tz = utcTZ
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let today = DateLogic.today(tz: tz)

    func ymd(_ date: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    func daysAgo(_ n: Int) -> String { ymd(cal.date(byAdding: .day, value: -n, to: today)!) }
    func daysAhead(_ n: Int) -> String { ymd(cal.date(byAdding: .day, value: n, to: today)!) }
    func monthsAgo(_ n: Int) -> String { ymd(cal.date(byAdding: .month, value: -n, to: today)!) }

    func sub(_ id: String, _ name: String, _ amount: Double,
             frequency: String = "Monthly", endDate: String? = nil,
             trialEnds: String? = nil, archived: Bool = false) -> Bill {
        Bill(id: id, name: name, category: "Subscriptions", amount: amount, dueDay: 10,
             frequency: frequency, endDate: endDate, trialEnds: trialEnds, archived: archived)
    }
    func tx(_ id: String, _ merchant: String, _ amount: Double, _ date: String) -> SpendTransaction {
        SpendTransaction(id: id, date: date, amount: amount, merchant: merchant)
    }

    section("SubscriptionsFinder — thresholds") {
        // The date-based cases below derive their fixtures from these constants
        // so they never rot — which also makes them blind to the value itself.
        // Pin them here, so changing a threshold is a deliberate, visible edit.
        checkEqual(SubscriptionsFinder.staleDays, 60, "stale after 60 days")
        checkEqual(SubscriptionsFinder.trialReminderDays, 3, "trials warn 3 days out")
        checkClose(SubscriptionsFinder.amountSimilarity, 0.15, "amounts within 15% match")
    }

    section("SubscriptionsFinder — monthlyOfBill / amountsSimilar") {
        checkClose(SubscriptionsFinder.monthlyOfBill(sub("1", "M", 20)), 20, "monthly")
        checkClose(SubscriptionsFinder.monthlyOfBill(sub("2", "W", 10, frequency: "Weekly")),
                   10 * 52 / 12, "weekly → monthly", tol: 0.0001)
        checkClose(SubscriptionsFinder.monthlyOfBill(sub("3", "B", 10, frequency: "Bi-weekly")),
                   10 * 26 / 12, "bi-weekly → monthly", tol: 0.0001)
        checkClose(SubscriptionsFinder.monthlyOfBill(sub("4", "Q", 30, frequency: "Quarterly")), 10, "quarterly")
        checkClose(SubscriptionsFinder.monthlyOfBill(sub("5", "A", 120, frequency: "Annually")), 10, "annually")
        // A bill with no amount contributes nothing rather than blowing up.
        checkClose(SubscriptionsFinder.monthlyOfBill(Bill(id: "6", name: "Blank")), 0, "no amount → 0")

        check(SubscriptionsFinder.amountsSimilar([]), "an empty set is similar")
        check(SubscriptionsFinder.amountsSimilar([10]), "one amount is similar")
        check(SubscriptionsFinder.amountsSimilar([10, 11]), "9% apart is similar")
        check(!SubscriptionsFinder.amountsSimilar([10, 20]), "50% apart is not")
        // All-zero amounts have no meaningful ratio; treat them as similar
        // rather than dividing by zero.
        check(SubscriptionsFinder.amountsSimilar([0, 0]), "all-zero avoids a divide by zero")
    }

    section("SubscriptionsFinder — bills") {
        let items = SubscriptionsFinder.build(
            bills: [
                sub("1", "Netflix", 15.49),
                sub("2", "Old Gym", 40, endDate: daysAgo(40)),
                sub("3", "Archived", 9, archived: true),
                Bill(id: "4", name: "Electric", category: "Utilities", amount: 85),
            ],
            transactions: [], tz: tz
        )
        checkEqual(items.map { $0.name }, ["Netflix"], "only active subscription bills")
        checkEqual(items.first?.source, "bill", "sourced from the bill")
        checkEqual(items.first?.id, "bill-1", "id is namespaced by source")
        checkEqual(items.first?.manageUrl, "https://www.netflix.com/cancelplan", "known brand resolves a cancel link")

        let sorted = SubscriptionsFinder.build(
            bills: [sub("1", "Cheap", 5), sub("2", "Pricey", 50), sub("3", "Middling", 20)],
            transactions: [], tz: tz
        )
        checkEqual(sorted.map { $0.name }, ["Pricey", "Middling", "Cheap"], "sorted by monthly cost")

        // The same service under two spellings — both rows are flagged so the
        // user can merge them.
        let dupes = SubscriptionsFinder.build(
            bills: [sub("1", "Disney Plus", 13.99), sub("2", "disneyplus", 13.99)],
            transactions: [], tz: tz
        )
        checkEqual(dupes.count, 2, "both duplicates are kept")
        check(dupes.allSatisfy { $0.duplicate }, "both sides are flagged")
    }

    section("SubscriptionsFinder — trials") {
        let items = SubscriptionsFinder.build(
            bills: [
                sub("1", "Soon", 10, trialEnds: daysAhead(2)),
                sub("2", "Later", 10, trialEnds: daysAhead(30)),
                sub("3", "NoTrial", 10),
            ],
            transactions: [], tz: tz
        )
        let byName = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0) })
        check(byName["Soon"]?.trialSoon == true, "a trial ending in 2 days is soon")
        checkEqual(byName["Soon"]?.trialDaysLeft, 2, "days left is counted")
        check(byName["Later"]?.trialSoon == false, "a month out is not soon")
        check(byName["NoTrial"]?.trialDaysLeft == nil, "no trial → no countdown")
    }

    section("SubscriptionsFinder — recurring merchants") {
        let found = SubscriptionsFinder.build(
            bills: [],
            transactions: [
                tx("1", "Spotify", 11.99, monthsAgo(2)),
                tx("2", "Spotify", 11.99, monthsAgo(1)),
                // One-off: a single month never looks like a subscription.
                tx("3", "Corner Store", 6.25, monthsAgo(1)),
            ],
            tz: tz
        )
        checkEqual(found.map { $0.name }, ["Spotify"], "two months of the same merchant")
        checkEqual(found.first?.source, "tx", "sourced from transactions")

        // Two months but wildly different amounts — a shop visited twice.
        let noise = SubscriptionsFinder.build(
            bills: [],
            transactions: [tx("1", "Target", 12, monthsAgo(2)), tx("2", "Target", 140, monthsAgo(1))],
            tz: tz
        )
        check(noise.isEmpty, "dissimilar two-month amounts are noise")

        // A third month is evidence enough on its own.
        let three = SubscriptionsFinder.build(
            bills: [],
            transactions: [
                tx("1", "Target", 12, monthsAgo(3)),
                tx("2", "Target", 140, monthsAgo(2)),
                tx("3", "Target", 30, monthsAgo(1)),
            ],
            tz: tz
        )
        checkEqual(three.map { $0.name }, ["Target"], "three months beats dissimilar amounts")

        let hiked = SubscriptionsFinder.build(
            bills: [],
            transactions: [tx("1", "Hulu", 7.99, monthsAgo(2)), tx("2", "Hulu", 8.99, monthsAgo(1))],
            tz: tz
        )
        checkClose(hiked.first?.priceUp ?? -1, 7.99, "a price rise reports the old amount", tol: 0.0001)
        check(hiked.first?.stale == false, "a recent charge is not stale")

        let stale = SubscriptionsFinder.build(
            bills: [],
            transactions: [
                tx("1", "Ghost", 5, daysAgo(SubscriptionsFinder.staleDays + 95)),
                tx("2", "Ghost", 5, daysAgo(SubscriptionsFinder.staleDays + 65)),
            ],
            tz: tz
        )
        check(stale.first?.stale == true, "nothing seen for 60+ days is stale")

        // The bill is the record; its card charges must not double-count.
        let tracked = SubscriptionsFinder.build(
            bills: [sub("1", "Netflix", 15.49)],
            transactions: [tx("1", "netflix", 15.49, monthsAgo(2)), tx("2", "NETFLIX", 15.49, monthsAgo(1))],
            tz: tz
        )
        checkEqual(tracked.count, 1, "a tracked bill suppresses its own transactions")
        checkEqual(tracked.first?.source, "bill", "the bill wins")

        let txs = [tx("1", "Spotify", 11.99, monthsAgo(2)), tx("2", "Spotify", 11.99, monthsAgo(1))]
        checkEqual(SubscriptionsFinder.build(bills: [], transactions: txs, tz: tz).count, 1, "found when not declined")
        check(SubscriptionsFinder.build(bills: [], transactions: txs, tz: tz, declined: ["SPOTIFY"]).isEmpty,
              "declining is remembered by normalized key, whatever the casing")
    }

    section("SubscriptionsFinder — a card payment is not a subscription") {
        // A card payment recurs monthly, from a consistent merchant string, for
        // a steady-ish amount — exactly the shape this finder looks for. Without
        // the transfer gate, paying your card off every month surfaced as a
        // subscription you might want to cancel.
        var payment1 = tx("p1", "Chase Card Payment", 450, monthsAgo(2))
        payment1.category = transferCategory
        var payment2 = tx("p2", "Chase Card Payment", 450, monthsAgo(1))
        payment2.category = transferCategory
        check(SubscriptionsFinder.build(bills: [], transactions: [payment1, payment2], tz: tz).isEmpty,
              "a recurring transfer is never a subscription")

        // The same cadence as ordinary spending still is one, so the gate is
        // rejecting the category rather than the pattern.
        var purchase1 = payment1; purchase1.category = "Shopping"
        var purchase2 = payment2; purchase2.category = "Shopping"
        checkEqual(SubscriptionsFinder.build(bills: [], transactions: [purchase1, purchase2], tz: tz).count, 1,
                   "the same rows as purchases are still found")
    }

    section("SubscriptionLinks — keys and manage URLs") {
        checkEqual(SubscriptionLinks.normalizeKey("Disney+ Plus"), "disneyplus", "punctuation stripped")
        checkEqual(SubscriptionLinks.normalizeKey("YouTube Premium"), "youtubepremium", "casing folded")
        checkEqual(SubscriptionLinks.normalizeKey("!!!"), "", "nothing left is empty")

        // The trailing comma is punctuation, not part of the URL.
        let typed = Bill(id: "1", name: "Netflix", notes: "cancel here: https://example.com/cancel, thanks")
        checkEqual(SubscriptionLinks.manageUrl(for: typed), "https://example.com/cancel", "a saved link wins")
        checkEqual(SubscriptionLinks.manageUrl(for: Bill(id: "2", name: "Spotify Family")),
                   "https://www.spotify.com/account/subscription/", "brand matched from the name")
        checkEqual(SubscriptionLinks.manageUrl(for: Bill(id: "3", name: "TV thing", business: "Hulu")),
                   "https://secure.hulu.com/account", "brand matched from the business")
        check(SubscriptionLinks.manageUrl(for: Bill(id: "4", name: "Local Gym")) == nil, "an unknown brand has no link")
    }
}
