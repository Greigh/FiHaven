import Foundation

/// Bank-vs-manual transaction reconciliation. FiHaven is manual-first; a linked
/// bank (Plaid) adds transactions tagged source:"plaid" ALONGSIDE the manual
/// ones, never replacing them — so the same purchase can appear twice. This
/// finds those overlaps to audit, plus bank rows with no manual match. Matching
/// is conservative: same amount (to the cent), a similar merchant, and a date
/// within ±1 day. A suggestion only. Mirrors the web `reconcile.js` (and
/// Android `Reconcile.kt`).
public enum Reconcile {
    private static func normMerchant(_ s: String) -> String {
        String(s.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
    }

    /// Do two transactions look like the SAME purchase?
    public static func looksSame(_ a: SpendTransaction, _ b: SpendTransaction, tz: TimeZone, dayTolerance: Int = 1) -> Bool {
        if abs(a.amount - b.amount) > 0.01 { return false }
        let am = normMerchant(a.merchant)
        let bm = normMerchant(b.merchant)
        if am.count < 3 || bm.count < 3 { return false }
        if !am.contains(bm) && !bm.contains(am) { return false }
        guard let da = DateLogic.parseDate(a.date, tz: tz),
              let db = DateLogic.parseDate(b.date, tz: tz) else { return false }
        let cal = DateLogic.calendar(tz: tz)
        let days = abs(cal.dateComponents([.day], from: da, to: db).day ?? 99)
        return days <= dayTolerance
    }

    public struct DuplicatePair: Equatable { public let manual: SpendTransaction; public let bank: SpendTransaction }

    /// Pairs where a bank transaction duplicates a manual one (each row paired
    /// at most once, newest bank first) — the audit queue.
    public static func duplicatePairs(_ transactions: [SpendTransaction], tz: TimeZone, dayTolerance: Int = 1) -> [DuplicatePair] {
        let manual = transactions.filter { $0.source != "plaid" }
        let bank = transactions.filter { $0.source == "plaid" }.sorted { $0.date > $1.date }
        var usedManual = Set<String>()
        var pairs: [DuplicatePair] = []
        for b in bank {
            if let m = manual.first(where: { !usedManual.contains($0.id) && looksSame($0, b, tz: tz, dayTolerance: dayTolerance) }) {
                usedManual.insert(m.id)
                pairs.append(DuplicatePair(manual: m, bank: b))
            }
        }
        return pairs
    }

    /// Bank transactions with no manual counterpart, newest first.
    public static func unmatchedBank(_ transactions: [SpendTransaction], tz: TimeZone, dayTolerance: Int = 1) -> [SpendTransaction] {
        let dupIds = Set(duplicatePairs(transactions, tz: tz, dayTolerance: dayTolerance).map { $0.bank.id })
        return transactions.filter { $0.source == "plaid" && !dupIds.contains($0.id) }.sorted { $0.date > $1.date }
    }

    /// Recent manual transactions (within `staleDays`, default 35) that the bank
    /// never corroborated — ones it "seems to be missing". Newest first.
    public static func unconfirmedManual(_ transactions: [SpendTransaction], tz: TimeZone, staleDays: Int = 35, now: Date = Date()) -> [SpendTransaction] {
        let cal = DateLogic.calendar(tz: tz)
        let today = DateLogic.today(tz: tz, now: now)
        guard let cutoff = cal.date(byAdding: .day, value: -staleDays, to: today) else { return [] }
        let bank = transactions.filter { $0.source == "plaid" }
        return transactions.filter { t in
            if t.source == "plaid" { return false }
            guard let d = DateLogic.parseDate(t.date, tz: tz), d >= cutoff, d <= today else { return false }
            return !bank.contains { looksSame(t, $0, tz: tz) }
        }.sorted { $0.date > $1.date }
    }
}
