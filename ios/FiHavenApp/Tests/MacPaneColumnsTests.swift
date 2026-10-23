import SwiftUI
import XCTest
@testable import FiHaven

/// `MacPaneColumns` is the one number behind "is there room for two columns?"
/// on every Mac screen that has a second one.
///
/// It is worth a test for the reason it was extracted: four screens each carried
/// their own threshold, and getting one wrong is invisible in a diff — the screen
/// stays split at a width where its main column has been starved to 84pt, which
/// looks like a layout accident rather than a wrong constant. `MacWindowDefaults`
/// is the other half of the arithmetic and is checked here too, because the
/// baseline only means anything against the window sizes the app actually allows.
///
/// These run on iOS because the constants are declared *outside* the
/// `#if !canImport(UIKit)` block in `PlatformStyle.swift` — deliberately, so a
/// layout promise about a Mac window can be asserted without a Mac test host.
@MainActor
final class MacPaneColumnsTests: XCTestCase {

    /// The app's own floor. If this grows, `minSplitWidth` has to be re-derived.
    func testMinimumWindowLeavesAPaneWideEnoughToSplit() {
        // The screen sidebar, which is the part of the window that is not pane.
        let sidebar: CGFloat = 236
        let pane = MacWindowDefaults.minSize.width - sidebar

        // The arithmetic the baseline exists for: a side column taken out of a
        // pane this narrow leaves the main column how much?
        let stranded = pane - MacPaneColumns.sideWidth
        XCTAssertEqual(stranded, 84, "the 84pt figure in the docs has moved")

        // And that is why the baseline is above it: at the minimum window no
        // screen splits, so no main column can be starved to it.
        XCTAssertGreaterThan(MacPaneColumns.minSplitWidth, pane)
    }

    /// The baseline must be room for both columns plus a main column that is
    /// still a column — not merely more than a single column.
    func testBaselineLeavesRoomForBothColumns() {
        let main = MacPaneColumns.minSplitWidth - MacPaneColumns.sideWidth
        XCTAssertGreaterThanOrEqual(main, 400,
            "at the baseline the main column would be narrower than a table needs")
    }

    /// The formula screens with a table use. `sideSplit` is the sum plus the
    /// floor, so a table with narrow columns still cannot split a narrow pane.
    func testSideSplitAddsTheSideColumnAndKeepsTheFloor() {
        // A table whose columns are wider than the baseline: 610 + 320 = 930,
        // which is what Payoff asks for.
        XCTAssertEqual(MacPaneColumns.sideSplit(mainColumn: 610), 930)
        // A table narrower than the baseline does not pull the threshold down.
        XCTAssertEqual(MacPaneColumns.sideSplit(mainColumn: 100),
                       MacPaneColumns.minSplitWidth)
        // Exactly at the crossover the two agree.
        let crossover = MacPaneColumns.minSplitWidth - MacPaneColumns.sideWidth
        XCTAssertEqual(MacPaneColumns.sideSplit(mainColumn: crossover),
                       MacPaneColumns.minSplitWidth)
        // One point past it, the sum wins — the main column gets what it asked for.
        XCTAssertEqual(MacPaneColumns.sideSplit(mainColumn: crossover + 1),
                       MacPaneColumns.minSplitWidth + 1)
    }

    /// A split has to be reachable without resizing the window, or every screen
    /// that offers one opens in its stacked layout and the second column is
    /// something a user has to discover by dragging — which is the arrangement
    /// the screens were converted away from.
    func testTheDefaultWindowIsWideEnoughToSplit() {
        // The screen sidebar is the part of the window that is not pane.
        let defaultPane = MacWindowDefaults.size.width - 236
        XCTAssertGreaterThanOrEqual(defaultPane, MacPaneColumns.minSplitWidth,
            "the default window should show a split wherever a screen offers one")
        // And the widest split any screen asks for still fits it, so no screen
        // is reachable only by making the window larger than it opens at.
        let widest = MacPaneColumns.sideSplit(mainColumn: 610)
        XCTAssertGreaterThanOrEqual(defaultPane, widest,
            "Payoff would open stacked in the default window")
    }
}
