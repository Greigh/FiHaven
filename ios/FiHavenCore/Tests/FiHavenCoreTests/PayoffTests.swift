import XCTest
@testable import FiHavenCore

/// Debt-payoff simulation — mirrors PayoffTest in LogicTest.kt (Android)
/// and the runPayoffSim cases in client/js/payoff.test.js.
///
/// `paidOffMonth == nil` means the *projection* ran out of its 360 months —
/// nothing more. `nonAmortizing` is the stronger claim: the minimum cannot
/// cover a month's interest, so the debt provably never clears on minimums.
final class PayoffTests: XCTestCase {
    private let tz = TimeZone(identifier: "UTC")!
    private let now = Date(timeIntervalSince1970: 1_781_524_800) // 2026-06-15T12:00:00Z

    private func card(_ id: String, balance: Double, minPayment: Double, apr: Double) -> Card {
        var c = Card(id: id, name: "Card \(id)")
        c.balance = balance
        c.minPayment = minPayment
        c.regularAPR = apr
        return c
    }

    private func sim(_ cards: [Card]) -> PayoffResult {
        Payoff.runPayoffSim(cards: cards, strategy: .none, extra: 0, tz: tz, now: now)!
    }

    /// $1,000 at 0% on $100/mo clears in 10 months — well inside the cap.
    func testPayoffBeforeTheCap() {
        let r = sim([card("1", balance: 1000, minPayment: 100, apr: 0)])
        XCTAssertEqual(r.cards[0].paidOffMonth, 10)
        XCTAssertEqual(r.cards[0].endBalance, 0, accuracy: 1e-6)
        XCTAssertFalse(r.cards[0].nonAmortizing)
    }

    /// $3,600 at 0% on $10/mo clears in exactly month 360 — the cap is
    /// reached, not exceeded, so it is a completed outcome.
    func testPayoffExactlyAtTheCap() {
        let r = sim([card("1", balance: 3600, minPayment: 10, apr: 0)])
        XCTAssertEqual(r.cards[0].paidOffMonth, 360)
        XCTAssertEqual(r.cards[0].endBalance, 0, accuracy: 1e-6)
        XCTAssertFalse(r.cards[0].nonAmortizing)
    }

    /// $3,700 at 0% on $10/mo needs 370 months — the projection stops at
    /// 360 with $100 left, still declining. Incomplete, not impossible.
    func testPayoffJustPastTheCap() {
        let r = sim([card("1", balance: 3700, minPayment: 10, apr: 0)])
        let c = r.cards[0]
        XCTAssertNil(c.paidOffMonth)
        XCTAssertEqual(c.endBalance, 100, accuracy: 1e-6)
        XCTAssertFalse(c.nonAmortizing)
    }

    /// $10,000 at 0% on $25/mo needs 400 months: capped at 360 with $1,000
    /// remaining — a slow payoff, never "minimums never clear this debt".
    func testTenThousandAtZeroAprIsNotImpossible() {
        let r = sim([card("1", balance: 10000, minPayment: 25, apr: 0)])
        let c = r.cards[0]
        XCTAssertEqual(r.months, 360)
        XCTAssertNil(c.paidOffMonth)
        XCTAssertEqual(c.endBalance, 1000, accuracy: 1e-6)
        XCTAssertFalse(c.nonAmortizing)
    }

    /// $10,000 at 24% accrues ~$200/mo; a $100 minimum can never keep up.
    /// Only this case earns the never-clears wording.
    func testGenuinelyNonAmortizingBalance() {
        let r = sim([card("1", balance: 10000, minPayment: 100, apr: 24)])
        let c = r.cards[0]
        XCTAssertEqual(r.months, 360)
        XCTAssertNil(c.paidOffMonth)
        XCTAssertGreaterThan(c.endBalance, c.origBalance)
        XCTAssertTrue(c.nonAmortizing)
    }
}
