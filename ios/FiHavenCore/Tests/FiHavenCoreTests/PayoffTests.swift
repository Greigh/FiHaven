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

    /// finished is false exactly when the cap cut a card short.
    func testFinishedFlag() {
        XCTAssertTrue(sim([card("1", balance: 1000, minPayment: 100, apr: 0)]).finished)
        XCTAssertFalse(sim([card("1", balance: 3700, minPayment: 10, apr: 0)]).finished)
    }

    // ── recommendedStrategy ──────────────────────────────────────────
    // A strategy may only be crowned when both sims ran to zero — a capped
    // projection's totalInterest is what accrued inside 360 months, not the
    // plan's cost, and it can land below a finished strategy's real total.

    private func sim(_ cards: [Card], strategy: PayoffStrategy, extra: Double) -> PayoffResult {
        Payoff.runPayoffSim(cards: cards, strategy: strategy, extra: extra, tz: tz, now: now)!
    }

    /// Avalanche retires the 24% card first, so it accrues less interest.
    func testRecommendedStrategyPicksTheCheaperFinishedPlan() {
        let deck = [card("low", balance: 2000, minPayment: 50, apr: 5),
                    card("high", balance: 2000, minPayment: 50, apr: 24)]
        let snow = sim(deck, strategy: .snowball, extra: 100)
        let aval = sim(deck, strategy: .avalanche, extra: 100)
        XCTAssertLessThan(aval.totalInterest, snow.totalInterest)
        XCTAssertEqual(Payoff.recommendedStrategy(snowball: snow, avalanche: aval), .avalanche)
    }

    /// $40,000 at 0% pays $110/mo ($10 min + $100 extra) — needs 364
    /// months, so both strategies run into the cap with ~$400 left.
    func testRecommendedStrategyIsNilWhenEitherStrategyCapped() {
        let deck = [card("1", balance: 40000, minPayment: 10, apr: 0)]
        let snow = sim(deck, strategy: .snowball, extra: 100)
        let aval = sim(deck, strategy: .avalanche, extra: 100)
        XCTAssertFalse(snow.finished)
        XCTAssertFalse(aval.finished)
        XCTAssertNil(Payoff.recommendedStrategy(snowball: snow, avalanche: aval))
    }

    /// The guard works per-side: a truncated run next to a finished one is
    /// still no comparison.
    func testRecommendedStrategyIsNilWhenOnlyOneSideFinished() {
        let snow = sim([card("1", balance: 1000, minPayment: 100, apr: 0)], strategy: .snowball, extra: 0)
        var capped = snow
        capped.cards[0].paidOffMonth = nil
        XCTAssertFalse(capped.finished)
        XCTAssertNil(Payoff.recommendedStrategy(snowball: snow, avalanche: capped))
        XCTAssertNil(Payoff.recommendedStrategy(snowball: capped, avalanche: snow))
    }

    func testRecommendedStrategyIsNilForMissingSims() {
        XCTAssertNil(Payoff.recommendedStrategy(snowball: nil, avalanche: nil))
        let aval = sim([card("1", balance: 1000, minPayment: 100, apr: 0)], strategy: .avalanche, extra: 100)
        XCTAssertNil(Payoff.recommendedStrategy(snowball: aval, avalanche: nil))
        XCTAssertNil(Payoff.recommendedStrategy(snowball: nil, avalanche: aval))
    }
}
