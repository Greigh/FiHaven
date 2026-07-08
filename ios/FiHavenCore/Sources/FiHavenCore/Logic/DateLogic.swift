import Foundation

/// Date / month-key helpers ported from utils.js + tz.js.
///
/// The web pins "today" to the calendar day in the user's configured
/// timezone, then does whole-day arithmetic against month/day dates so a
/// "due tomorrow" never flips on time-of-day. We reproduce that by doing
/// every computation in a single `Calendar` set to that timezone and
/// taking day differences via date components (DST-safe).
public enum DateLogic {
    /// A Gregorian calendar pinned to `tz`. Pass `TimeZone.current` (or
    /// resolve `settings.timezone`) for the user's zone.
    public static func calendar(tz: TimeZone) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        return cal
    }

    /// Resolve the effective timezone from a settings value: an IANA name,
    /// or the device zone when empty/"auto"/invalid (mirrors tz.js).
    public static func resolveTimeZone(_ name: String?) -> TimeZone {
        guard let n = name, !n.isEmpty, n != "auto", let tz = TimeZone(identifier: n) else {
            return TimeZone.current
        }
        return tz
    }

    /// "Today" at the start of the calendar day in `tz`.
    public static func today(tz: TimeZone, now: Date = Date()) -> Date {
        calendar(tz: tz).startOfDay(for: now)
    }

    /// "YYYY-MM" for a date in `tz`.
    public static func monthKey(_ date: Date, tz: TimeZone) -> String {
        let c = calendar(tz: tz).dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }

    /// "YYYY-MM" for "now".
    public static func currentMonthKey(tz: TimeZone, now: Date = Date()) -> String {
        monthKey(now, tz: tz)
    }

    /// Start-of-day Date for a given year/month/day in `cal`. Out-of-range
    /// components roll over (Calendar normalizes them), matching JS
    /// `new Date(y, m, d)`.
    public static func dateForDay(_ day: Int, year: Int, month: Int, cal: Calendar) -> Date {
        var dc = DateComponents()
        dc.year = year
        dc.month = month
        dc.day = day
        let d = cal.date(from: dc) ?? Date()
        return cal.startOfDay(for: d)
    }

    private static func daysBetween(_ from: Date, _ to: Date, cal: Calendar) -> Int {
        cal.dateComponents([.day], from: from, to: to).day ?? 0
    }

    /// Days from today to the next occurrence of `dueDay`. If this month's
    /// due day is more than one day in the past, rolls to next month.
    public static func daysUntilDue(dueDay: Int, tz: TimeZone, now: Date = Date()) -> Int {
        let cal = calendar(tz: tz)
        let t = cal.startOfDay(for: now)
        let c = cal.dateComponents([.year, .month], from: t)
        let thisMonth = dateForDay(dueDay, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
        let diff = daysBetween(t, thisMonth, cal: cal)
        if diff < -1 {
            let nextMonth = dateForDay(dueDay, year: c.year ?? 0, month: (c.month ?? 1) + 1, cal: cal)
            return daysBetween(t, nextMonth, cal: cal)
        }
        return diff
    }

    /// Like `daysUntilDue`, but when the current period is fully paid the
    /// obligation for this cycle is satisfied — show time until the next due.
    public static func effectiveDaysUntilDue(
        dueDay: Int,
        whenFullyPaid fullyPaid: Bool,
        tz: TimeZone,
        now: Date = Date()
    ) -> Int {
        guard dueDay > 0 else { return 9999 }
        if fullyPaid {
            let cal = calendar(tz: tz)
            let t = cal.startOfDay(for: now)
            let c = cal.dateComponents([.year, .month], from: t)
            let thisMonth = dateForDay(dueDay, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
            let target = thisMonth > t
                ? thisMonth
                : dateForDay(dueDay, year: c.year ?? 0, month: (c.month ?? 1) + 1, cal: cal)
            return daysBetween(t, target, cal: cal)
        }
        return daysUntilDue(dueDay: dueDay, tz: tz, now: now)
    }

    /// The actual date of the next forward-looking occurrence of `dueDay`:
    /// this month's if it's today-or-later, else next month's.
    public static func nextDueDate(dueDay: Int, tz: TimeZone, now: Date = Date()) -> Date? {
        guard dueDay > 0 else { return nil }
        let cal = calendar(tz: tz)
        let t = cal.startOfDay(for: now)
        let c = cal.dateComponents([.year, .month], from: t)
        let thisMonth = dateForDay(dueDay, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
        if thisMonth >= t { return thisMonth }
        return dateForDay(dueDay, year: c.year ?? 0, month: (c.month ?? 1) + 1, cal: cal)
    }

    /// Whole months from now until a "YYYY-MM-DD" string (floored at 0),
    /// compared by year/month in `tz`.
    public static func monthsUntil(_ dateString: String?, tz: TimeZone, now: Date = Date()) -> Int {
        guard let end = parseDate(dateString, tz: tz) else { return 0 }
        let cal = calendar(tz: tz)
        let e = cal.dateComponents([.year, .month], from: end)
        let n = cal.dateComponents([.year, .month], from: now)
        let months = ((e.year ?? 0) - (n.year ?? 0)) * 12 + ((e.month ?? 0) - (n.month ?? 0))
        return max(0, months)
    }

    /// Parse a "YYYY-MM-DD" (or longer ISO) string into a start-of-day Date
    /// in `tz`. Returns nil for empty/unparseable input.
    public static func parseDate(_ dateString: String?, tz: TimeZone) -> Date? {
        guard let s = dateString, !s.isEmpty else { return nil }
        let head = s.split(separator: "T").first.map(String.init) ?? s
        let parts = head.split(separator: "-")
        if parts.count >= 3,
           let y = Int(parts[0]),
           let m = Int(parts[1]),
           let d = Int(parts[2].prefix(2)) {
            return dateForDay(d, year: y, month: m, cal: calendar(tz: tz))
        }
        return ISO8601DateFormatter().date(from: s)
    }

    /// A date as "YYYY-MM-DD" in `tz`. Lets us compare against a bill's
    /// startDate/endDate strings with a plain lexicographic comparison.
    public static func ymd(_ date: Date, tz: TimeZone) -> String {
        let c = calendar(tz: tz).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    // A bill's optional active window. "First bill due on" (startDate)
    // gates when it begins; "Stops on" (endDate) retires it. Both are
    // optional "YYYY-MM-DD". An out-of-window bill is excluded from
    // due/overdue, totals, the calendar, and reminders (it still shows
    // in the list with a badge).
    public static func billNotStarted(_ bill: Bill, onYmd ymd: String) -> Bool {
        guard let s = bill.startDate, !s.isEmpty else { return false }
        return ymd < s
    }
    public static func billEnded(_ bill: Bill, onYmd ymd: String) -> Bool {
        guard let e = bill.endDate, !e.isEmpty else { return false }
        return ymd > e
    }
    public static func billActive(_ bill: Bill, onYmd ymd: String) -> Bool {
        if bill.archived { return false }
        return !billNotStarted(bill, onYmd: ymd) && !billEnded(bill, onYmd: ymd)
    }

    /// Convenience: the active checks evaluated against `tz`'s today.
    public static func billNotStarted(_ bill: Bill, tz: TimeZone, now: Date = Date()) -> Bool {
        billNotStarted(bill, onYmd: ymd(today(tz: tz, now: now), tz: tz))
    }
    public static func billEnded(_ bill: Bill, tz: TimeZone, now: Date = Date()) -> Bool {
        billEnded(bill, onYmd: ymd(today(tz: tz, now: now), tz: tz))
    }
    public static func billActive(_ bill: Bill, tz: TimeZone, now: Date = Date()) -> Bool {
        billActive(bill, onYmd: ymd(today(tz: tz, now: now), tz: tz))
    }

    /// True if a bill's active window overlaps a budgeting period.
    public static func billInPeriod(_ bill: Bill, bounds: PeriodBounds, tz: TimeZone) -> Bool {
        let cal = calendar(tz: tz)
        let lastDay = cal.date(byAdding: .day, value: -1, to: bounds.endDate) ?? bounds.startDate
        let lastYmd = ymd(lastDay, tz: tz)
        let startYmd = ymd(bounds.startDate, tz: tz)
        return !billEnded(bill, onYmd: startYmd) && !billNotStarted(bill, onYmd: lastYmd)
    }

    /// "Long Month Year" label for a "YYYY-MM" key (e.g. "June 2026").
    public static func monthKeyLabel(_ mk: String, tz: TimeZone) -> String {
        let parts = mk.split(separator: "-")
        guard parts.count >= 2, let y = Int(parts[0]), let m = Int(parts[1]) else { return "" }
        let cal = calendar(tz: tz)
        let date = dateForDay(1, year: y, month: m, cal: cal)
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: date)
    }
}
