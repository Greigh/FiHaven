import XCTest
@testable import FiHavenCore

final class BillScheduleTests: XCTestCase {
    private let utc = TimeZone(identifier: "UTC")!

    func testDay31ClampingInShortMonths() {
        let cal = DateLogic.calendar(tz: utc)

        // February 2026 has 28 days
        let febDate = DateLogic.dateForDay(31, year: 2026, month: 2, cal: cal)
        let febComponents = cal.dateComponents([.year, .month, .day], from: febDate)
        XCTAssertEqual(febComponents.year, 2026)
        XCTAssertEqual(febComponents.month, 2)
        XCTAssertEqual(febComponents.day, 28)

        // April 2026 has 30 days
        let aprDate = DateLogic.dateForDay(31, year: 2026, month: 4, cal: cal)
        let aprComponents = cal.dateComponents([.year, .month, .day], from: aprDate)
        XCTAssertEqual(aprComponents.year, 2026)
        XCTAssertEqual(aprComponents.month, 4)
        XCTAssertEqual(aprComponents.day, 30)

        // March 2026 has 31 days
        let marDate = DateLogic.dateForDay(31, year: 2026, month: 3, cal: cal)
        let marComponents = cal.dateComponents([.year, .month, .day], from: marDate)
        XCTAssertEqual(marComponents.year, 2026)
        XCTAssertEqual(marComponents.month, 3)
        XCTAssertEqual(marComponents.day, 31)
    }

    func testBillDueOnDay31InShortMonths() {
        let cal = DateLogic.calendar(tz: utc)
        var bill = Bill(id: "b31", name: "Day 31 Bill")
        bill.dueDay = 31
        bill.frequency = "Monthly"

        var c28 = DateComponents()
        c28.year = 2026; c28.month = 2; c28.day = 28
        let feb28 = cal.date(from: c28)!

        var c27 = DateComponents()
        c27.year = 2026; c27.month = 2; c27.day = 27
        let feb27 = cal.date(from: c27)!

        var c30 = DateComponents()
        c30.year = 2026; c30.month = 4; c30.day = 30
        let apr30 = cal.date(from: c30)!

        XCTAssertTrue(BillSchedule.dueOn(bill, date: feb28, tz: utc))
        XCTAssertFalse(BillSchedule.dueOn(bill, date: feb27, tz: utc))
        XCTAssertTrue(BillSchedule.dueOn(bill, date: apr30, tz: utc))
    }
}
