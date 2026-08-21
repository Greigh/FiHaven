import XCTest
import FiHavenCore
@testable import FiHaven

/// The per-device snooze queue behind the dashboard's Snooze button. The
/// rules are covered in FiHavenCore (SnoozeChecks); this covers the part
/// that only exists in the app — that a snooze survives a relaunch, and that
/// a stale queue is cleaned up on the way in.
@MainActor
final class SnoozeStoreTests: XCTestCase {
    private var suite: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suite = "fh-snooze-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testSnoozeHidesTheRowAndUnsnoozeBringsItBack() {
        let store = SnoozeStore(defaults: defaults)
        XCTAssertFalse(store.isSnoozed(type: "bill", refId: "1"))
        store.snooze(type: "bill", refId: "1", tz: .current)
        XCTAssertTrue(store.isSnoozed(type: "bill", refId: "1"))
        // Same refId, different kind of record — not the same row.
        XCTAssertFalse(store.isSnoozed(type: "card", refId: "1"))
        store.unsnooze(type: "bill", refId: "1")
        XCTAssertFalse(store.isSnoozed(type: "bill", refId: "1"))
    }

    func testASnoozeSurvivesARelaunch() {
        let first = SnoozeStore(defaults: defaults)
        first.snooze(type: "bill", refId: "9", tz: .current)

        let relaunched = SnoozeStore(defaults: defaults)
        XCTAssertTrue(relaunched.isSnoozed(type: "bill", refId: "9"))
    }

    func testExpiredEntriesArePrunedOnLaunch() {
        let past = Date().addingTimeInterval(-60).timeIntervalSince1970 * 1000
        let future = Date().addingTimeInterval(3600).timeIntervalSince1970 * 1000
        defaults.set(["bill:old": past, "bill:future": future], forKey: SnoozeStore.key)

        let store = SnoozeStore(defaults: defaults)
        XCTAssertEqual(Set(store.map.keys), ["bill:future"])
        XCTAssertFalse(store.isSnoozed(type: "bill", refId: "old"))
        XCTAssertTrue(store.isSnoozed(type: "bill", refId: "future"))
        // The prune is written back, not just applied in memory.
        let stored = (defaults.dictionary(forKey: SnoozeStore.key) as? [String: Double]) ?? [:]
        XCTAssertEqual(Set(stored.keys), ["bill:future"])
    }

    func testAJunkStoredValueStartsEmpty() {
        defaults.set("not a dictionary", forKey: SnoozeStore.key)
        let store = SnoozeStore(defaults: defaults)
        XCTAssertTrue(store.map.isEmpty)
        XCTAssertFalse(store.isSnoozed(type: "bill", refId: "1"))
    }
}
