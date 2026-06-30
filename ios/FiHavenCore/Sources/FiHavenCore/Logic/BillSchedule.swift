import Foundation

/// When a bill is actually due, honoring its frequency label.
/// Cards stay monthly-on-dueDay; only bills use this enum.
public enum BillSchedule {
    private struct Spec {
        let unit: String // "day" | "month"
        let step: Int
    }

    private static let maxLookahead = 400

    private static func frequencySpec(_ frequency: String) -> Spec {
        switch frequency {
        case "Weekly": return Spec(unit: "day", step: 7)
        case "Bi-weekly": return Spec(unit: "day", step: 14)
        case "Quarterly": return Spec(unit: "month", step: 3)
        case "Annually": return Spec(unit: "month", step: 12)
        default: return Spec(unit: "month", step: 1)
        }
    }

    public static func anchor(_ bill: Bill, tz: TimeZone, now: Date = Date()) -> Date {
        if let s = bill.startDate, !s.isEmpty, let d = DateLogic.parseDate(s, tz: tz) {
            return DateLogic.calendar(tz: tz).startOfDay(for: d)
        }
        let cal = DateLogic.calendar(tz: tz)
        let dd = bill.dueDay ?? 1
        let t = DateLogic.today(tz: tz, now: now)
        let c = cal.dateComponents([.year], from: t)
        return DateLogic.dateForDay(dd, year: c.year ?? 0, month: 1, cal: cal)
    }

    public static func dueOn(_ bill: Bill, date: Date, tz: TimeZone) -> Bool {
        guard bill.dueDay != nil || !(bill.startDate ?? "").isEmpty else { return false }
        let cal = DateLogic.calendar(tz: tz)
        let d = cal.startOfDay(for: date)
        let ymd = DateLogic.ymd(d, tz: tz)
        if !DateLogic.billActive(bill, onYmd: ymd) { return false }

        let spec = frequencySpec(bill.frequency)
        let a = anchor(bill, tz: tz)

        if spec.unit == "day" {
            let days = cal.dateComponents([.day], from: a, to: d).day ?? 0
            return days >= 0 && days % spec.step == 0
        }

        let dueDay = bill.dueDay ?? cal.component(.day, from: a)
        let c = cal.dateComponents([.year, .month], from: d)
        let dueThisMonth = DateLogic.dateForDay(dueDay, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
        if DateLogic.ymd(dueThisMonth, tz: tz) != ymd { return false }
        let ac = cal.dateComponents([.year, .month], from: a)
        let monthsDiff = ((c.year ?? 0) - (ac.year ?? 0)) * 12 + ((c.month ?? 0) - (ac.month ?? 0))
        return monthsDiff >= 0 && monthsDiff % spec.step == 0
    }

    public static func nextDueDate(_ bill: Bill, tz: TimeZone, from: Date = Date()) -> Date? {
        guard bill.dueDay != nil || !(bill.startDate ?? "").isEmpty else { return nil }
        let cal = DateLogic.calendar(tz: tz)
        var cursor = cal.startOfDay(for: from)
        if let s = bill.startDate, !s.isEmpty, let start = DateLogic.parseDate(s, tz: tz), cursor < start {
            cursor = cal.startOfDay(for: start)
        }
        for _ in 0...maxLookahead {
            if dueOn(bill, date: cursor, tz: tz) { return cursor }
            cursor = cal.date(byAdding: .day, value: 1, to: cursor) ?? cursor
        }
        return nil
    }

    public static func daysUntilDue(_ bill: Bill, tz: TimeZone, now: Date = Date()) -> Int {
        guard let next = nextDueDate(bill, tz: tz, from: now) else { return 9999 }
        let cal = DateLogic.calendar(tz: tz)
        let today = DateLogic.today(tz: tz, now: now)
        return cal.dateComponents([.day], from: today, to: next).day ?? 9999
    }

    /// Like `daysUntilDue`, but when the current period is fully paid show
    /// time until the next due occurrence instead of an overdue count.
    public static func effectiveDaysUntilDue(
        _ bill: Bill,
        whenFullyPaid fullyPaid: Bool,
        tz: TimeZone,
        now: Date = Date()
    ) -> Int {
        if fullyPaid {
            guard let next = nextDueDate(bill, tz: tz, from: now) else { return 9999 }
            let cal = DateLogic.calendar(tz: tz)
            let today = DateLogic.today(tz: tz, now: now)
            return cal.dateComponents([.day], from: today, to: next).day ?? 9999
        }
        return daysUntilDue(bill, tz: tz, now: now)
    }

    public static func dueInPeriod(_ bill: Bill, bounds: PeriodBounds, tz: TimeZone) -> Bool {
        let cal = DateLogic.calendar(tz: tz)
        var d = cal.startOfDay(for: bounds.startDate)
        let end = bounds.endDate
        while d < end {
            if dueOn(bill, date: d, tz: tz) { return true }
            d = cal.date(byAdding: .day, value: 1, to: d) ?? d
        }
        return false
    }

    public static func dueOnOrBeforeInPeriod(_ bill: Bill, bounds: PeriodBounds, tz: TimeZone, asOf: Date = Date()) -> Date? {
        let cal = DateLogic.calendar(tz: tz)
        var d = cal.startOfDay(for: bounds.startDate)
        let end = bounds.endDate
        let cutoff = cal.startOfDay(for: asOf)
        var last: Date?
        while d < end {
            if dueOn(bill, date: d, tz: tz), d <= cutoff { last = d }
            d = cal.date(byAdding: .day, value: 1, to: d) ?? d
        }
        return last
    }
}
