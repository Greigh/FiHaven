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
        Frequency(key: "weekly",      label: "Weekly",       perMonth: 52.0 / 12.0),
        Frequency(key: "biweekly",    label: "Bi-weekly",    perMonth: 26.0 / 12.0),
        Frequency(key: "semimonthly", label: "Semi-monthly", perMonth: 2),
        Frequency(key: "monthly",     label: "Monthly",      perMonth: 1),
        Frequency(key: "annual",      label: "Annual",       perMonth: 1.0 / 12.0),
    ]

    /// Per-month multiplier for a frequency key; unknown keys → monthly (1).
    public static func factor(for frequency: String) -> Double {
        frequencies.first { $0.key == frequency }?.perMonth ?? 1
    }

    /// Monthly equivalent of a single income source.
    public static func monthly(of source: IncomeSource) -> Double {
        source.amount * factor(for: source.frequency)
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
}
