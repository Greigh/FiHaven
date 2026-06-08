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
        } catch {
            // Offline or error: keep whatever we have, flag it.
            syncState = .offline
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
    var monthLabel: String { DateLogic.monthKeyLabel(currentMonthKey, tz: tz) }
    var monthlyIncome: Double { Income.monthlyIncome(from: data.settings) }
    var upcoming: [UpcomingItem] {
        Schedule.buildUpcomingItems(bills: data.bills, cards: data.cards, tz: tz)
    }

    /// Total still owed this month: the sum of each item's
    /// remaining-to-goal, so partial payments shrink it.
    var remainingThisMonth: Double {
        upcoming.reduce(0) { $0 + remaining($1) }
    }

    func isPaid(_ item: UpcomingItem) -> Bool {
        Schedule.isPaid(data.payments, type: item.type, refId: item.refId, monthKey: currentMonthKey)
    }

    // ── Fully-paid goal logic (mirrors utils.js) ────────────────────
    var paidGoalPolicy: PaidGoalPolicy { PaidGoalPolicy.from(data.settings.paidGoal) }

    /// The fully-paid goal for a bill/card this month under the policy.
    func goalAmount(type: String, refId: String) -> Double {
        if type == "bill" {
            guard let b = data.bills.first(where: { String($0.id) == refId }) else { return 0 }
            return Schedule.goalAmount(bill: b)
        } else {
            guard let c = data.cards.first(where: { String($0.id) == refId }) else { return 0 }
            return Schedule.goalAmount(
                card: c, policy: paidGoalPolicy,
                payments: data.payments, monthKey: currentMonthKey, tz: tz
            )
        }
    }

    func paidAmount(type: String, refId: String) -> Double {
        Schedule.paidAmount(data.payments, type: type, refId: refId, monthKey: currentMonthKey)
    }

    func remaining(type: String, refId: String) -> Double {
        max(0, goalAmount(type: type, refId: refId) - paidAmount(type: type, refId: refId))
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
    func isFullyPaid(_ item: UpcomingItem) -> Bool { isFullyPaid(type: item.type, refId: item.refId) }
    func paidState(_ item: UpcomingItem) -> PaidState { paidState(type: item.type, refId: item.refId) }
}
