import Foundation

/// Category icons + card accent palette, ported from utils.js so the
/// native apps match the web's iconography.
public enum CTConstants {
    public static let categoryIcons: [String: String] = [
        "Housing": "🏠",
        "Utilities": "⚡",
        "Subscriptions": "🔁",
        "Insurance": "🛡️",
        "Loan": "🏦",
        "Auto": "🚗",
        "Investment": "📈",
        "Other": "📌",
    ]

    public static func icon(forCategory category: String) -> String {
        categoryIcons[category] ?? "📌"
    }

    public static let cardIcon = "💳"

    /// Bill category names, in the order the web presents them.
    public static let categories = [
        "Housing", "Utilities", "Subscriptions",
        "Insurance", "Loan", "Auto", "Investment", "Other",
    ]

    /// Card accent colors as hex strings (see utils.js CARD_COLORS).
    public static let cardColors = [
        "#1A6BFF", "#C0392B", "#1A7A4A",
        "#7B3CC0", "#C06010", "#007080", "#8B5A00",
    ]
}
