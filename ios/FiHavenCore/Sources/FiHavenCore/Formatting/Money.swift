import Foundation

/// Currency formatting matching the web client. The display currency is set
/// once from the user's synced `currency` setting (default USD); each
/// currency carries a locale so grouping and symbol placement match the
/// region.
public enum Money {
    /// Active display currency (ISO 4217). Set from settings on data load.
    nonisolated(unsafe) public static var currencyCode = "USD"

    static let locales: [String: String] = [
        "USD": "en_US", "CAD": "en_CA", "AUD": "en_AU", "GBP": "en_GB", "EUR": "en_IE",
        "JPY": "ja_JP", "INR": "en_IN", "CHF": "de_CH", "MXN": "es_MX", "BRL": "pt_BR",
    ]

    /// Apply the display currency (no-op for unknown codes).
    public static func setCurrency(_ code: String?) {
        if let code, locales[code] != nil { currencyCode = code }
    }

    /// "$1,450.00" — the currency's natural fraction digits.
    public static func fmt(_ n: Double) -> String { format(n, fraction: nil) }

    /// "$1,450" — no fraction digits.
    public static func fmtShort(_ n: Double) -> String { format(n, fraction: 0) }

    private static func format(_ n: Double, fraction: Int?) -> String {
        let value = n.isFinite ? n : 0
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currencyCode
        f.locale = Locale(identifier: locales[currencyCode] ?? "en_US")
        if let fraction {
            f.minimumFractionDigits = fraction
            f.maximumFractionDigits = fraction
        }
        return f.string(from: NSNumber(value: value)) ?? "0"
    }
}
