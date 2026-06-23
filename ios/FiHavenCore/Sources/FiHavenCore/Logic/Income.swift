import Foundation

/// Income-frequency normalization, ported from income.js. All three
/// clients must agree on these factors so the runway/budget numbers match.
public enum Income {
    public struct Frequency: Equatable, Sendable {
        public let key: String
        public let label: String
        public let perMonth: Double
    }

    public static let frequencies: [Frequency] = [
        Frequency(key: "hourly",      label: "Hourly",       perMonth: 52.0 / 12.0), // ×hoursPerWeek
        Frequency(key: "weekly",      label: "Weekly",       perMonth: 52.0 / 12.0),
        Frequency(key: "biweekly",    label: "Bi-weekly",    perMonth: 26.0 / 12.0),
        Frequency(key: "semimonthly", label: "Semi-monthly", perMonth: 2),
        Frequency(key: "monthly",     label: "Monthly",      perMonth: 1),
        Frequency(key: "annual",      label: "Annual",       perMonth: 1.0 / 12.0),
    ]

    /// Weeks per month — converts an hourly rate (× hours/week) to monthly.
    public static let weeksPerMonth: Double = 52.0 / 12.0

    /// Per-month multiplier for a frequency key; unknown keys → monthly (1).
    public static func factor(for frequency: String) -> Double {
        frequencies.first { $0.key == frequency }?.perMonth ?? 1
    }

    /// Monthly equivalent of a single income source. Hourly multiplies the
    /// rate by hours/week by weeks-per-month; others by the frequency factor.
    public static func monthly(of source: IncomeSource) -> Double {
        if source.frequency == "hourly" {
            return source.amount * source.hoursPerWeek * weeksPerMonth
        }
        return source.amount * factor(for: source.frequency)
    }

    /// The user's monthly income: sum of `settings.incomes`, falling back
    /// to the legacy single `settings.income` when the list is empty.
    public static func monthlyIncome(from settings: Settings) -> Double {
        let sources = settings.incomes
        if !sources.isEmpty {
            return sources.reduce(0) { $0 + monthly(of: $1) }
        }
        return settings.income
    }

    /// Adjustments (bonuses / unpaid time off / raises) affecting period `mk`.
    public static func adjustments(from settings: Settings, monthKey mk: String) -> [IncomeAdjustment] {
        settings.incomeAdjustments.filter { $0.applies(to: mk) }
    }

    /// Signed total of all adjustments affecting period `mk`.
    public static func adjustmentsTotal(from settings: Settings, monthKey mk: String) -> Double {
        adjustments(from: settings, monthKey: mk).reduce(0) { $0 + $1.amount }
    }

    /// Effective income for a specific period: base income + applicable adjustments.
    public static func monthlyIncome(from settings: Settings, monthKey mk: String) -> Double {
        monthlyIncome(from: settings) + adjustmentsTotal(from: settings, monthKey: mk)
    }

    /// Average calendar month length — used to prorate income for non-calendar periods.
    public static let avgMonthDays: Double = 365.0 / 12.0

    /// Whole days in a period (start inclusive, end exclusive).
    public static func periodDays(_ bounds: PeriodBounds, tz: TimeZone) -> Int {
        let cal = DateLogic.calendar(tz: tz)
        return cal.dateComponents([.day], from: bounds.startDate, to: bounds.endDate).day ?? Int(avgMonthDays)
    }

    /// Calendar months overlapping a period, with the fraction of each month covered.
    public static func monthOverlaps(_ bounds: PeriodBounds, tz: TimeZone) -> [(mk: String, fraction: Double)] {
        let cal = DateLogic.calendar(tz: tz)
        var out: [(String, Double)] = []
        var cursor = cal.date(from: cal.dateComponents([.year, .month], from: bounds.startDate)) ?? bounds.startDate
        while cursor < bounds.endDate {
            let monthStart = cursor
            guard let monthEnd = cal.date(byAdding: .month, value: 1, to: monthStart) else { break }
            let overlapStart = max(bounds.startDate, monthStart)
            let overlapEnd = min(bounds.endDate, monthEnd)
            let overlapDays = cal.dateComponents([.day], from: overlapStart, to: overlapEnd).day ?? 0
            let monthDays = cal.dateComponents([.day], from: monthStart, to: monthEnd).day ?? 30
            if overlapDays > 0, monthDays > 0 {
                let c = cal.dateComponents([.year, .month], from: monthStart)
                let mk = String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
                out.append((mk, Double(overlapDays) / Double(monthDays)))
            }
            cursor = monthEnd
        }
        return out
    }

    /// Signed total of adjustments affecting a period (prorated for non-calendar modes).
    public static func adjustmentsTotal(from settings: Settings, bounds: PeriodBounds, tz: TimeZone) -> Double {
        if bounds.mode == "calendar" {
            return adjustmentsTotal(from: settings, monthKey: bounds.key)
        }
        return monthOverlaps(bounds, tz: tz).reduce(0) { sum, pair in
            sum + adjustmentsTotal(from: settings, monthKey: pair.mk) * pair.fraction
        }
    }

    /// Effective income for the active budgeting period.
    public static func periodIncome(from settings: Settings, bounds: PeriodBounds, tz: TimeZone) -> Double {
        let base = monthlyIncome(from: settings)
        if bounds.mode == "calendar" {
            return base + adjustmentsTotal(from: settings, monthKey: bounds.key)
        }
        let days = Double(periodDays(bounds, tz: tz))
        let prorate = days / avgMonthDays
        return base * prorate + adjustmentsTotal(from: settings, bounds: bounds, tz: tz)
    }

    public static func incomeLabel(for config: PeriodConfig) -> String {
        config.mode == "calendar" ? "Monthly income" : "Period income"
    }

    public static func owedLabel(for config: PeriodConfig) -> String {
        config.mode == "calendar" ? "Left to pay" : "Left this period"
    }
}
