import Foundation
import SwiftUI
import FiHavenCore

enum SyncState {
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
        } catch {
            // Offline or error: keep whatever we have, flag it.
            syncState = .offline
        }
    }

    /// Opt-in: auto-mark autopay bills/cards paid once their due date in the
    /// current period has arrived and they have no payment yet. Mirrors
    /// autopay.js + the server scheduler safety net.
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

        func considerBill(_ b: Bill) {
            guard b.autopay else { return }
            guard b.dueDay != nil || !(b.startDate ?? "").isEmpty else { return }
            guard BillSchedule.dueOnOrBeforeInPeriod(b, bounds: bounds, tz: tz, asOf: todayDate) != nil else { return }
            let refId = String(b.id)
            if Schedule.paidAmount(data.payments, type: "bill", refId: refId, in: bounds) > Schedule.paidEpsilon { return }
            if Schedule.isSkipped(data.payments, type: "bill", refId: refId, in: bounds) { return }
            newPayments.append(Payment(
                id: Self.newPaymentID(), type: "bill", refId: refId, name: b.name,
                amount: b.amount, date: todayISO(), monthKey: mkCal, note: "Auto-marked (autopay)"
            ))
        }

        func considerCard(type: String, refId: String, name: String, dueDay: Int?, autopay: Bool, amount: Double) {
            guard autopay, let dd = dueDay, dd > 0, let due = dueInPeriod(dd), due <= todayDate else { return }
            if Schedule.paidAmount(data.payments, type: type, refId: refId, in: bounds) > Schedule.paidEpsilon { return }
            if Schedule.isSkipped(data.payments, type: type, refId: refId, in: bounds) { return }
            newPayments.append(Payment(
                id: Self.newPaymentID(), type: type, refId: refId, name: name,
                amount: amount, date: todayISO(), monthKey: mkCal, note: "Auto-marked (autopay)"
            ))
        }

        for b in data.bills { considerBill(b) }
        for c in data.cards {
            considerCard(type: "card", refId: String(c.id), name: c.name + " (payment)",
                         dueDay: c.dueDay, autopay: c.autopay, amount: goalAmount(type: "card", refId: String(c.id)))
        }
        if !newPayments.isEmpty {
            mutate { $0.payments.append(contentsOf: newPayments) }
        }
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
        Schedule.buildUpcomingItems(bills: data.bills, cards: data.cards, tz: tz)
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

    // UpcomingItem conveniences.
    func goalAmount(_ item: UpcomingItem) -> Double { goalAmount(type: item.type, refId: item.refId) }
    func paidAmount(_ item: UpcomingItem) -> Double { paidAmount(type: item.type, refId: item.refId) }
    func remaining(_ item: UpcomingItem) -> Double { remaining(type: item.type, refId: item.refId) }
    func isSkipped(_ item: UpcomingItem) -> Bool { isSkipped(type: item.type, refId: item.refId) }
    func isFullyPaid(_ item: UpcomingItem) -> Bool { isFullyPaid(type: item.type, refId: item.refId) }
    func paidState(_ item: UpcomingItem) -> PaidState { paidState(type: item.type, refId: item.refId) }
}
