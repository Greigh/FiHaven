import Foundation
import FiHavenCore

/// Per-device "snooze until tomorrow" for dashboard rows, backed by
/// UserDefaults. Mirrors web's snoozes.svelte.js, which keeps the same map in
/// localStorage: a snooze is never synced, so hiding a row on your phone
/// leaves it alone on every other device.
///
/// The rules live in `Snoozes` (FiHavenCore) alongside their Kotlin twin; this
/// type only owns the storage and the published state SwiftUI redraws on.
@MainActor
final class SnoozeStore: ObservableObject {
    /// One store per app: the dashboard can render its Upcoming section from
    /// more than one place (classic layout, widget layout), and they must not
    /// keep separate queues.
    static let shared = SnoozeStore()

    /// Same key as web's localStorage entry, for one less thing to remember.
    static let key = "fh_snoozes"

    /// "type:refId" → epoch-millisecond the snooze expires.
    @Published private(set) var map: [String: Double] = [:]

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Prune on launch so an old queue can't grow without bound; expired
        // entries already read as awake, so this is only housekeeping.
        let stored = (defaults.dictionary(forKey: Self.key) as? [String: Double]) ?? [:]
        let pruned = Snoozes.pruned(stored)
        map = pruned
        if pruned.count != stored.count { persist() }
    }

    func isSnoozed(type: String, refId: String) -> Bool {
        Snoozes.isSnoozed(map, type: type, refId: refId)
    }

    func snooze(type: String, refId: String, tz: TimeZone) {
        map = Snoozes.snoozed(map, type: type, refId: refId, tz: tz)
        persist()
    }

    func unsnooze(type: String, refId: String) {
        map = Snoozes.unsnoozed(map, type: type, refId: refId)
        persist()
    }

    func isSnoozed(_ item: UpcomingItem) -> Bool {
        isSnoozed(type: item.type, refId: item.refId)
    }

    func snooze(_ item: UpcomingItem, tz: TimeZone) {
        snooze(type: item.type, refId: item.refId, tz: tz)
    }

    func unsnooze(_ item: UpcomingItem) {
        unsnooze(type: item.type, refId: item.refId)
    }

    private func persist() {
        defaults.set(map, forKey: Self.key)
    }
}
