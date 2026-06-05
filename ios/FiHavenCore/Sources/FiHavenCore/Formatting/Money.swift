import Foundation

/// Currency formatting matching the web client's `fmt`/`fmtShort`
/// (en-US grouping, "$" prefix). Used for amounts throughout the UI.
public enum Money {
    /// "$1,450.00" — two fraction digits.
    public static func fmt(_ n: Double) -> String {
        "$" + decimal(n, fraction: 2)
    }

    /// "$1,450" — no fraction digits.
    public static func fmtShort(_ n: Double) -> String {
        "$" + decimal(n, fraction: 0)
    }

    private static func decimal(_ n: Double, fraction: Int) -> String {
        let value = n.isFinite ? n : 0
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = fraction
        f.maximumFractionDigits = fraction
        return f.string(from: NSNumber(value: value)) ?? "0"
    }
}
