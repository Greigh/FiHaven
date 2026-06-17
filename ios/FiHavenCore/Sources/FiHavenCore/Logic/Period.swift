import Foundation

/// The user's budgeting "period". Mirrors period.js. Three modes:
/// - calendar : the calendar month. key "YYYY-MM" (legacy behavior).
/// - startDay : a month-length period beginning on day N.
/// - rolling  : fixed consecutive K-day buckets anchored at an epoch.
///
/// Paid/owed is matched by whether a payment's `date` falls in the
/// period's [start, end) — using lexical comparison of the "YYYY-MM-DD"
/// strings — so switching modes needs no data migration.
public struct PeriodConfig: Equatable, Sendable {
    public var mode: String     // "calendar" | "startDay" | "rolling"
    public var startDay: Int    // 1...28
    public var length: Int      // 7...90
    public var anchor: String?  // "YYYY-MM-DD" rolling start; nil = epoch

    public init(mode: String = "calendar", startDay: Int = 1, length: Int = 35, anchor: String? = nil) {
        self.mode = (mode == "startDay" || mode == "rolling") ? mode : "calendar"
        self.startDay = min(max(startDay, 1), 28)
        self.length = min(max(length, 7), 90)
        if let a = anchor, a.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
            self.anchor = a
        } else {
            self.anchor = nil
        }
    }
}

public struct PeriodBounds: Equatable, Sendable {
    public var startKey: String  // "YYYY-MM-DD" inclusive
    public var endKey: String    // "YYYY-MM-DD" exclusive
    public var key: String       // period key (calendar: "YYYY-MM", else start date)
    public var startDate: Date
    public var endDate: Date
    public var mode: String

    /// True if `p` falls within [startKey, endKey). Uses the payment's
    /// date string; date-less records only place in calendar mode.
    public func contains(_ p: Payment) -> Bool {
        if !p.date.isEmpty {
            return p.date >= startKey && p.date < endKey
        }
        return mode == "calendar" && p.monthKey == key
    }
}

public enum Period {
    private static func iso(_ date: Date, _ cal: Calendar) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public static func config(from settings: Settings) -> PeriodConfig {
        PeriodConfig(
            mode: settings.periodMode ?? "calendar",
            startDay: settings.periodStartDay ?? 1,
            length: settings.periodLength ?? 35,
            anchor: settings.periodAnchor
        )
    }

    /// Bounds for the period containing `date`.
    public static func bounds(for date: Date, config: PeriodConfig, tz: TimeZone) -> PeriodBounds {
        let cal = DateLogic.calendar(tz: tz)
        let day = cal.startOfDay(for: date)

        if config.mode == "startDay" {
            let c = cal.dateComponents([.year, .month], from: day)
            var start = DateLogic.dateForDay(config.startDay, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
            if day < start {
                start = DateLogic.dateForDay(config.startDay, year: c.year ?? 0, month: (c.month ?? 1) - 1, cal: cal)
            }
            let end = cal.date(byAdding: .month, value: 1, to: start) ?? start
            return PeriodBounds(startKey: iso(start, cal), endKey: iso(end, cal),
                                key: iso(start, cal), startDate: start, endDate: end, mode: config.mode)
        }

        if config.mode == "rolling" {
            var epoch = DateLogic.dateForDay(1, year: 2020, month: 1, cal: cal)
            if let a = config.anchor {
                let p = a.split(separator: "-").compactMap { Int($0) }
                if p.count == 3 { epoch = DateLogic.dateForDay(p[2], year: p[0], month: p[1], cal: cal) }
            }
            let daysSince = cal.dateComponents([.day], from: epoch, to: day).day ?? 0
            let idx = Int(floor(Double(daysSince) / Double(config.length)))
            let start = cal.date(byAdding: .day, value: idx * config.length, to: epoch) ?? epoch
            let end = cal.date(byAdding: .day, value: config.length, to: start) ?? start
            return PeriodBounds(startKey: iso(start, cal), endKey: iso(end, cal),
                                key: iso(start, cal), startDate: start, endDate: end, mode: config.mode)
        }

        // calendar
        let c = cal.dateComponents([.year, .month], from: day)
        let start = DateLogic.dateForDay(1, year: c.year ?? 0, month: c.month ?? 1, cal: cal)
        let end = DateLogic.dateForDay(1, year: c.year ?? 0, month: (c.month ?? 1) + 1, cal: cal)
        let key = String(format: "%04d-%02d", c.year ?? 0, c.month ?? 1)
        return PeriodBounds(startKey: iso(start, cal), endKey: iso(end, cal),
                            key: key, startDate: start, endDate: end, mode: "calendar")
    }

    public static func currentBounds(config: PeriodConfig, tz: TimeZone, now: Date = Date()) -> PeriodBounds {
        bounds(for: DateLogic.today(tz: tz, now: now), config: config, tz: tz)
    }

    public static func currentKey(config: PeriodConfig, tz: TimeZone, now: Date = Date()) -> String {
        currentBounds(config: config, tz: tz, now: now).key
    }

    /// Resolve bounds for a period key string (key === the period's start).
    public static func boundsForKey(_ key: String, config: PeriodConfig, tz: TimeZone) -> PeriodBounds {
        let cal = DateLogic.calendar(tz: tz)
        let parts = key.split(separator: "-").compactMap { Int($0) }
        let date: Date
        if parts.count >= 3 {
            date = DateLogic.dateForDay(parts[2], year: parts[0], month: parts[1], cal: cal)
        } else if parts.count == 2 {
            date = DateLogic.dateForDay(1, year: parts[0], month: parts[1], cal: cal)
        } else {
            date = DateLogic.today(tz: tz)
        }
        return bounds(for: date, config: config, tz: tz)
    }

    /// Shift a period by `offset` whole periods.
    public static func shift(_ b: PeriodBounds, by offset: Int, config: PeriodConfig, tz: TimeZone) -> PeriodBounds {
        if offset == 0 { return b }
        let cal = DateLogic.calendar(tz: tz)
        let pivot: Date
        if config.mode == "rolling" {
            pivot = cal.date(byAdding: .day, value: offset * config.length, to: b.startDate) ?? b.startDate
        } else {
            pivot = cal.date(byAdding: .month, value: offset, to: b.startDate) ?? b.startDate
        }
        return bounds(for: pivot, config: config, tz: tz)
    }

    /// The period key a payment belongs to (for History grouping).
    public static func keyForPayment(_ p: Payment, config: PeriodConfig, tz: TimeZone) -> String {
        if let d = DateLogic.parseDate(p.date, tz: tz) {
            return bounds(for: d, config: config, tz: tz).key
        }
        return p.monthKey
    }

    /// Human label for a period's bounds.
    public static func label(_ b: PeriodBounds, config: PeriodConfig, tz: TimeZone) -> String {
        if config.mode == "calendar" {
            return DateLogic.monthKeyLabel(b.key, tz: tz)
        }
        let cal = DateLogic.calendar(tz: tz)
        let last = cal.date(byAdding: .day, value: -1, to: b.endDate) ?? b.endDate
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        let startStr = f.string(from: b.startDate)
        f.dateFormat = "MMM d, yyyy"
        return startStr + " – " + f.string(from: last)
    }

    public static func labelForKey(_ key: String, config: PeriodConfig, tz: TimeZone) -> String {
        label(boundsForKey(key, config: config, tz: tz), config: config, tz: tz)
    }
}
