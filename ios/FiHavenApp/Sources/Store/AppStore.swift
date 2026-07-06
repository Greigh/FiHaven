import Foundation
import SwiftUI
import FiHavenCore

enum SyncState: Equatable {
    case idle, saving, saved, offline

    var label: String {
        switch self {
        case .idle: return ""
        case .saving: return "Saving…"
        case .saved: return "All changes saved"
        case .offline: return "Offline — changes pending"
        }
    }
}

/// Holds the signed-in user's data and keeps it in sync with the server:
/// load on sign-in, debounced full-snapshot PUT on every edit. Mirrors
/// storage.svelte.js (docs/native-contract.md §4).
@MainActor
final class AppStore: ObservableObject {
    @Published private(set) var data = AppData()
    @Published private(set) var syncState: SyncState = .idle
    @Published private(set) var loaded = false

    private let api: APIClient
    private var saveTask: Task<Void, Never>?
    private let debounce: Duration = .milliseconds(800)

    init(api: APIClient) { self.api = api }

    func load() async {
        do {
            data = try await api.fetchData()
            Money.setCurrency(data.settings.currency)
            loaded = true
            syncState = .saved
            runAutopayMark()
            refreshNotifications()
            PushRegistrar.shared.syncIfNeeded(settings: data.settings)
        } catch {
            // Offline or error: keep whatever we have, flag it.
            syncState = .offline
        }
    }

    /// Opt-in: auto-mark autopay bills/cards paid once their due date in the
    /// current period has arrived. Each item is marked at most once per
    /// period, tracked in `settings.autopayDone` so a user's undo isn't
    /// reverted and $0 items behave (membership, not a payment amount, gates
    /// a second mark). The memory is keyed by calendar month — read across
    /// every month the period overlaps — to line up with the server.
    /// Mirrors autopay.js + the server scheduler.
    func runAutopayMark() {
        guard data.settings.autopayMark else { return }
        let bounds = currentBounds
        let cal = DateLogic.calendar(tz: tz)
        let todayDate = DateLogic.today(tz: tz)
        let mkCal = currentMonthKey

        func dueInPeriod(_ dueDay: Int) -> Date? {
            let sc = cal.dateComponents([.year, .month], from: bounds.startDate)
            var d = DateLogic.dateForDay(dueDay, year: sc.year ?? 0, month: sc.month ?? 1, cal: cal)
            if d < bounds.startDate {
                d = DateLogic.dateForDay(dueDay, year: sc.year ?? 0, month: (sc.month ?? 1) + 1, cal: cal)
            }
            return d < bounds.endDate ? d : nil
        }

        var newPayments: [Payment] = []
        // Items already auto-marked, read across every calendar month the
        // period overlaps (a long rolling window can span several).
        var handled = Set<String>()
        let done = data.settings.autopayDone
        for m in Self.monthsInBounds(bounds, cal: cal) {
            done[m].map { handled.formUnion($0) }
        }
        var newlyMarked: [String] = []

        func considerBill(_ b: Bill) {
            guard b.autopay else { return }
            let refKey = "bill:\(b.id)"
            guard !handled.contains(refKey) else { return }
            guard b.dueDay != nil || !(b.startDate ?? "").isEmpty else { return }
            if let apDay = b.autopayDay, apDay > 0 {
                // Autopay pulls on its own day; the bill must still be
                // scheduled this period, but the trigger is the autopay day.
                guard BillSchedule.dueInPeriod(b, bounds: bounds, tz: tz) else { return }
                guard let due = dueInPeriod(apDay), due <= todayDate else { return }
            } else {
                guard BillSchedule.dueOnOrBeforeInPeriod(b, bounds: bounds, tz: tz, asOf: todayDate) != nil else { return }
            }
            let refId = String(b.id)
            if Schedule.paidAmount(data.payments, type: "bill", refId: refId, in: bounds) > Schedule.paidEpsilon { return }
            if Schedule.isSkipped(data.payments, type: "bill", refId: refId, in: bounds) { return }
            newPayments.append(Payment(
                id: Self.newPaymentID(), type: "bill", refId: refId, name: b.name,
                amount: b.amount, date: todayISO(), monthKey: mkCal, note: "Auto-marked (autopay)"
            ))
            handled.insert(refKey)
            newlyMarked.append(refKey)
        }

        func considerCard(type: String, refId: String, name: String, dueDay: Int?, autopay: Bool, amount: Double) {
            guard autopay, let dd = dueDay, dd > 0, let due = dueInPeriod(dd), due <= todayDate else { return }
            let refKey = "\(type):\(refId)"
            guard !handled.contains(refKey) else { return }
            if Schedule.paidAmount(data.payments, type: type, refId: refId, in: bounds) > Schedule.paidEpsilon { return }
            if Schedule.isSkipped(data.payments, type: type, refId: refId, in: bounds) { return }
            newPayments.append(Payment(
                id: Self.newPaymentID(), type: type, refId: refId, name: name,
                amount: amount, date: todayISO(), monthKey: mkCal, note: "Auto-marked (autopay)"
            ))
            handled.insert(refKey)
            newlyMarked.append(refKey)
        }

        for b in data.bills { considerBill(b) }
        for c in data.cards {
            // Autopay pulls on `autopayDay`; nil falls back to the due day.
            let effDay = (c.autopayDay ?? 0) > 0 ? c.autopayDay : c.dueDay
            considerCard(type: "card", refId: String(c.id), name: c.name + " (payment)",
                         dueDay: effDay, autopay: c.autopay, amount: goalAmount(type: "card", refId: String(c.id)))
        }
        if !newPayments.isEmpty {
            // New marks go in this month's bucket; keep buckets for the last
            // 4 months (covers the longest rolling window) and drop the rest.
            var calBucket = Set(done[mkCal] ?? [])
            calBucket.formUnion(newlyMarked)
            let minKey = Self.shiftMonthKey(mkCal, by: -3)
            var next: [String: [String]] = [:]
            for (k, v) in done where k >= minKey && k != mkCal { next[k] = v }
            next[mkCal] = Array(calBucket)
            mutate {
                $0.payments.append(contentsOf: newPayments)
                $0.settings.autopayDone = next
            }
        }
    }

    /// Shift a "YYYY-MM" key by `delta` months.
    static func shiftMonthKey(_ mk: String, by delta: Int) -> String {
        let parts = mk.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return mk }
        let total = parts[0] * 12 + (parts[1] - 1) + delta
        return String(format: "%04d-%02d", total / 12, total % 12 + 1)
    }

    /// The "YYYY-MM" calendar months a period's [start, end) overlaps.
    static func monthsInBounds(_ bounds: PeriodBounds, cal: Calendar) -> [String] {
        let last = cal.date(byAdding: .day, value: -1, to: bounds.endDate) ?? bounds.startDate
        let s = cal.dateComponents([.year, .month], from: bounds.startDate)
        let e = cal.dateComponents([.year, .month], from: last)
        var idx = (s.year ?? 0) * 12 + ((s.month ?? 1) - 1)
        let endIdx = (e.year ?? 0) * 12 + ((e.month ?? 1) - 1)
        var out: [String] = []
        while idx <= endIdx {
            out.append(String(format: "%04d-%02d", idx / 12, idx % 12 + 1))
            idx += 1
        }
        return out
    }

    /// Mutate the in-memory data and schedule a debounced save.
    func mutate(_ block: (inout AppData) -> Void) {
        block(&data)
        scheduleSave()
    }

    /// Flush any pending save immediately (e.g. on background).
    func flush() async {
        saveTask?.cancel()
        saveTask = nil
        await push()
    }

    private func scheduleSave() {
        syncState = .saving
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: self.debounce)
            if Task.isCancelled { return }
            await self.push()
        }
    }

    private func push() async {
        do {
            try await api.saveData(data)
            syncState = .saved
        } catch {
            syncState = .offline
        }
        // Reschedule on-device reminders from the latest data regardless of
        // whether the network save succeeded (notifications are local).
        refreshNotifications()
    }

    /// Re-sync on-device bill reminders to the current bills + settings.
    func refreshNotifications() {
        NotificationScheduler.reschedule(bills: data.bills, cards: data.cards, settings: data.settings, tz: tz)
    }

    // ── Derived values (use the ported core logic) ──────────────────
    var tz: TimeZone { DateLogic.resolveTimeZone(data.settings.timezone) }
    var currentMonthKey: String { DateLogic.currentMonthKey(tz: tz) }
    // The active budgeting period (calendar / startDay / rolling).
    var periodConfig: PeriodConfig { Period.config(from: data.settings) }
    var currentBounds: PeriodBounds { Period.currentBounds(config: periodConfig, tz: tz) }
    var currentPeriodKey: String { currentBounds.key }
    var monthLabel: String { Period.label(currentBounds, config: periodConfig, tz: tz) }
    var periodIncome: Double { Income.periodIncome(from: data.settings, bounds: currentBounds, tz: tz) }
    var incomeLabel: String { Income.incomeLabel(for: periodConfig) }
    var owedLabel: String { Income.owedLabel(for: periodConfig) }
    var hidePaidOnDashboard: Bool { data.settings.hidePaidOnDashboard }

    /// Bills/cards that count as obligations in the current period.
    var periodObligationItems: [UpcomingItem] {
        upcoming.filter { item in
            if item.type == "card" { return true }
            guard let bill = data.bills.first(where: { String($0.id) == item.refId }) else { return false }
            return BillSchedule.dueInPeriod(bill, bounds: currentBounds, tz: tz)
        }
    }

    /// Upcoming items visible on the dashboard (respects hide-paid setting).
    var dashboardUpcoming: [UpcomingItem] {
        if hidePaidOnDashboard {
            return upcoming.filter { !isFullyPaid($0) }
        }
        return upcoming
    }

    /// Billing-cycle noun for period-correct labels ("Paid this quarter").
    /// Cards are always monthly; bills follow their own frequency.
    func periodNoun(_ item: UpcomingItem) -> String {
        guard item.type == "bill",
              let bill = data.bills.first(where: { String($0.id) == item.refId })
        else { return "month" }
        return BillSchedule.periodNoun(bill.frequency)
    }

    // ── Net worth (assets − liabilities) ────────────────────────────
    var assets: Double { data.accounts.reduce(0) { $0 + $1.balance } }
    var liabilities: Double { data.cards.reduce(0) { $0 + $1.balance } }
    var netWorth: Double { assets - liabilities }

    // ── Spending (transactions in the current period) ───────────────
    var periodTransactions: [SpendTransaction] {
        let b = currentBounds
        return data.transactions.filter { !$0.date.isEmpty && $0.date >= b.startKey && $0.date < b.endKey }
    }
    func spent(category: String) -> Double {
        periodTransactions.filter { $0.category == category }.reduce(0) { $0 + $1.amount }
    }
    var totalSpent: Double { periodTransactions.reduce(0) { $0 + $1.amount } }
    var upcoming: [UpcomingItem] {
        Schedule.buildUpcomingItems(
            bills: data.bills,
            cards: data.cards,
            tz: tz,
            payments: data.payments,
            bounds: currentBounds,
            policy: paidGoalPolicy
        )
    }

    /// Total still owed this period: the sum of each obligation's
    /// remaining-to-goal, so partial payments shrink it.
    var remainingThisMonth: Double {
        periodObligationItems.reduce(0) { $0 + remaining($1) }
    }

    func isPaid(_ item: UpcomingItem) -> Bool {
        Schedule.isPaid(data.payments, type: item.type, refId: item.refId, in: currentBounds)
    }

    // ── Fully-paid goal logic (mirrors utils.js) ────────────────────
    var paidGoalPolicy: PaidGoalPolicy { PaidGoalPolicy.from(data.settings.paidGoal) }

    /// The fully-paid goal for a bill/card this period under the policy.
    func goalAmount(type: String, refId: String) -> Double {
        if type == "bill" {
            guard let b = data.bills.first(where: { String($0.id) == refId }) else { return 0 }
            return Schedule.goalAmount(bill: b)
        } else {
            guard let c = data.cards.first(where: { String($0.id) == refId }) else { return 0 }
            return Schedule.goalAmount(
                card: c, policy: paidGoalPolicy,
                payments: data.payments, in: currentBounds, tz: tz
            )
        }
    }

    func paidAmount(type: String, refId: String) -> Double {
        Schedule.paidAmount(data.payments, type: type, refId: refId, in: currentBounds)
    }

    /// True if this bill/card has been skipped for the current period.
    func isSkipped(type: String, refId: String) -> Bool {
        Schedule.isSkipped(data.payments, type: type, refId: refId, in: currentBounds)
    }

    func remaining(type: String, refId: String) -> Double {
        if isSkipped(type: type, refId: refId) { return 0 }
        return max(0, goalAmount(type: type, refId: refId) - paidAmount(type: type, refId: refId))
    }

    func isFullyPaid(type: String, refId: String) -> Bool {
        remaining(type: type, refId: refId) <= Schedule.paidEpsilon
    }

    func paidState(type: String, refId: String) -> PaidState {
        if isFullyPaid(type: type, refId: refId) { return .full }
        return paidAmount(type: type, refId: refId) > Schedule.paidEpsilon ? .partial : .unpaid
    }

    /// A warning to show before skipping a card this period, or nil when it's
    /// safe to skip. Warns if the minimum (late-fee risk) or the suggested
    /// payment under the active goal policy hasn't been met. Mirrors the web's
    /// skipMonth warning in modals.js.
    func cardSkipWarning(refId: String, name: String) -> String? {
        guard let c = data.cards.first(where: { String($0.id) == refId }) else { return nil }
        let paid = paidAmount(type: "card", refId: refId)
        let min  = c.minPayment
        let goal = goalAmount(type: "card", refId: refId)
        if min > 0, paid + Schedule.paidEpsilon < min {
            return "You haven’t paid the minimum of \(Money.fmt(min)) on \(name) yet. "
                + "Skipping could mean a late fee or extra interest."
        }
        if goal > 0, paid + Schedule.paidEpsilon < goal {
            return "You haven’t reached your suggested payment of \(Money.fmt(goal)) on \(name) yet."
        }
        return nil
    }

    // UpcomingItem conveniences.
    func goalAmount(_ item: UpcomingItem) -> Double { goalAmount(type: item.type, refId: item.refId) }
    func paidAmount(_ item: UpcomingItem) -> Double { paidAmount(type: item.type, refId: item.refId) }
    func remaining(_ item: UpcomingItem) -> Double { remaining(type: item.type, refId: item.refId) }
    func isSkipped(_ item: UpcomingItem) -> Bool { isSkipped(type: item.type, refId: item.refId) }
    func isFullyPaid(_ item: UpcomingItem) -> Bool { isFullyPaid(type: item.type, refId: item.refId) }
    func paidState(_ item: UpcomingItem) -> PaidState { paidState(type: item.type, refId: item.refId) }
}
