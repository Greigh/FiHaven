import XCTest
@testable import FiHavenCore

/// Card debt and credit utilization — the two figures that treated loans as
/// cards, and that read the statement balance where the issuer reads the live
/// one. Mirrors CardTotalsTest.kt on Android and the cases in
/// client/js/utils.test.js.
final class CardTotalsTests: XCTestCase {
    private func card(
        _ id: String,
        balance: Double,
        limit: Double = 0,
        currentBalance: Double? = nil,
        type: String = "card",
        archived: Bool = false
    ) -> Card {
        var c = Card(id: id, name: "Card \(id)")
        c.balance = balance
        c.limit = limit
        c.currentBalance = currentBalance
        c.type = type
        c.archived = archived
        return c
    }

    // MARK: - liveBalance

    func testLiveBalancePrefersTheTrackedCurrentBalance() {
        XCTAssertEqual(Schedule.liveBalance(card("1", balance: 300, currentBalance: 500)), 500)
    }

    func testLiveBalanceFallsBackToTheStatement() {
        XCTAssertEqual(Schedule.liveBalance(card("1", balance: 300)), 300)
    }

    func testAZeroCurrentBalanceIsTrackedNotAbsent() {
        // 0 is a real "you paid it off" reading, not a missing value.
        XCTAssertEqual(Schedule.liveBalance(card("1", balance: 300, currentBalance: 0)), 0)
    }

    // MARK: - utilization

    func testUtilizationUsesTheLiveBalanceNotTheStatement() {
        // The bug this guards: a card charged since its statement closed read
        // 30% on the dashboard alert while its own row read 91%.
        let c = card("1", balance: 3000, limit: 10000, currentBalance: 9100)
        XCTAssertEqual(try XCTUnwrap(Schedule.utilization(c)), 0.91, accuracy: 1e-9)
    }

    func testUtilizationIsNilForALoan() {
        // A mortgage has a principal, not a revolving limit.
        XCTAssertNil(Schedule.utilization(card("1", balance: 250_000, limit: 300_000, type: "loan")))
    }

    func testUtilizationIsNilWithNoLimitSet() {
        XCTAssertNil(Schedule.utilization(card("1", balance: 500, limit: 0)))
    }

    func testUtilizationCanExceedOneWhenOverLimit() {
        // Not clamped here — callers that draw a bar clamp for display, but the
        // sort and the alert want the true ratio.
        let c = card("1", balance: 1200, limit: 1000)
        XCTAssertEqual(try XCTUnwrap(Schedule.utilization(c)), 1.2, accuracy: 1e-9)
    }

    // MARK: - cardDebt

    func testCardDebtExcludesLoans() {
        // The headline bug: loans live in the cards list, so a tracked mortgage
        // was landing in "card debt".
        let cards = [card("1", balance: 500), card("2", balance: 250_000, type: "loan")]
        XCTAssertEqual(Schedule.cardDebt(cards), 500)
    }

    func testCardDebtExcludesArchivedCards() {
        let cards = [card("1", balance: 500), card("2", balance: 900, archived: true)]
        XCTAssertEqual(Schedule.cardDebt(cards), 500)
    }

    func testCardDebtUsesLiveBalances() {
        let cards = [card("1", balance: 300, currentBalance: 800), card("2", balance: 200)]
        XCTAssertEqual(Schedule.cardDebt(cards), 1000)
    }

    func testCardDebtOfNothingIsZero() {
        XCTAssertEqual(Schedule.cardDebt([]), 0)
        XCTAssertEqual(Schedule.cardDebt([card("1", balance: 900, type: "loan")]), 0)
    }
}
