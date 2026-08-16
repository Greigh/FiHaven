import XCTest
@testable import FiHaven

/// The tab catalog and saved-order resolution behind the bottom bar and the
/// More menu. Mirrors TabCatalogTest.kt — this is what decides whether a tab
/// is reachable at all, and it had no coverage on either platform.
final class TabCatalogTests: XCTestCase {
    func testEveryTabHasAUniqueIdAndResolvesBack() {
        let ids = TabItem.allCases.map(\.rawValue)
        XCTAssertEqual(ids.count, Set(ids).count, "tab ids must be unique")
        for item in TabItem.allCases {
            XCTAssertEqual(TabItem(rawValue: item.rawValue), item)
        }
        XCTAssertNil(TabItem(rawValue: "nope"))
    }

    func testEveryTabHasATitleAndASymbol() {
        for item in TabItem.allCases {
            XCTAssertFalse(item.title.isEmpty, "\(item.rawValue) needs a title")
            XCTAssertFalse(item.symbol.isEmpty, "\(item.rawValue) needs an SF Symbol")
            XCTAssertFalse(item.menuTitle.isEmpty, "\(item.rawValue) needs a menu title")
        }
    }

    func testBalancesIsShortInTheBarAndSpeltOutInMore() {
        // The bottom-bar slot is ~80pt wide, so the tab strip gets the short
        // name; the More list is full-width and gets the unambiguous one.
        XCTAssertEqual(TabItem.balances.title, "Balances")
        XCTAssertEqual(TabItem.balances.menuTitle, "Account Balances")
        // Every other tab reads the same in both places — the override is the
        // exception, not a second catalog to keep in sync.
        for item in TabItem.allCases where item != .balances {
            XCTAssertEqual(item.menuTitle, item.title, "\(item.rawValue)")
        }
    }

    func testBalancesIsInTheCatalogAndStartsUnderMore() {
        XCTAssertEqual(TabItem(rawValue: "balances"), .balances)
        let (bottom, overflow) = resolveTabs(saved: nil)
        XCTAssertFalse(bottom.contains(.balances))
        XCTAssertTrue(overflow.contains(.balances))
    }

    func testNothingSavedFallsBackToTheDefaultBar() {
        let (bottom, overflow) = resolveTabs(saved: nil)
        XCTAssertEqual(bottom, [.dashboard, .bills, .cards, .payoff])
        // Everything the bar does not show has to be reachable from More.
        XCTAssertEqual(overflow, TabItem.allCases.filter { !bottom.contains($0) })
    }

    func testTheSavedOrderIsHonoredAndTheRestFallToMore() {
        let (bottom, overflow) = resolveTabs(saved: ["spending", "bills"])
        XCTAssertEqual(bottom, [.spending, .bills])
        XCTAssertTrue(overflow.contains(.dashboard))
        // Overflow keeps catalog order, not saved order.
        let catalogOrder = TabItem.allCases.filter { overflow.contains($0) }
        XCTAssertEqual(overflow, catalogOrder)
    }

    func testUnknownAndRepeatedIdsAreDropped() {
        // A tab removed in a later build, or a duplicated id, must not create a
        // phantom slot or a duplicate one.
        let (bottom, overflow) = resolveTabs(saved: ["bills", "ghost", "bills", "cards"])
        XCTAssertEqual(bottom, [.bills, .cards])
        XCTAssertTrue(overflow.allSatisfy { !bottom.contains($0) })
    }

    func testEveryTabIsReachableInEveryResolution() {
        // The invariant that matters: bottom + overflow is always the whole
        // catalog, so no tab can be stranded by a saved layout.
        let cases: [[String]?] = [
            nil, [], ["bills"], ["ghost"], TabItem.allCases.map(\.rawValue),
        ]
        for saved in cases {
            let (bottom, overflow) = resolveTabs(saved: saved)
            XCTAssertEqual(Set(bottom + overflow), Set(TabItem.allCases), "saved=\(String(describing: saved))")
            XCTAssertEqual(bottom.count + overflow.count, TabItem.allCases.count,
                           "saved=\(String(describing: saved))")
        }
    }

    func testIncomeIsInTheCatalogAndStartsUnderMore() {
        // Income became its own destination; the default bar is unchanged, so
        // it has to arrive in the More list rather than displacing a tab.
        XCTAssertEqual(TabItem(rawValue: "income"), .income)
        let (bottom, overflow) = resolveTabs(saved: nil)
        XCTAssertFalse(bottom.contains(.income))
        XCTAssertTrue(overflow.contains(.income))
    }

    func testTheCatalogMatchesAndroidsOrder() {
        // The saved `tabs` list is synced between platforms, so the catalogs
        // have to agree on ids — an id only one platform knows is a tab that
        // silently disappears when the other saves the layout.
        XCTAssertEqual(TabItem.allCases.map(\.rawValue), [
            "dashboard", "bills", "cards", "loans", "payoff", "rewards",
            "income", "budget", "spending", "subscriptions", "calendar",
            "history", "networth", "balances",
        ])
    }
}
