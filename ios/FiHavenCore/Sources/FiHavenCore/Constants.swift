import Foundation

/// Category icons + card accent palette, ported from utils.js /
/// categoryIcons.js so the native apps match the web's iconography.
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

    /// Resolve a category icon (emoji or custom image) from settings overrides.
    public static func iconInfo(
        forCategory category: String,
        overrides: [String: CategoryIcon] = [:]
    ) -> CategoryIcon {
        if let custom = overrides[category] { return custom }
        return .emoji(categoryIcons[category] ?? "📌")
    }

    /// Emoji-only convenience. Image overrides fall back to the built-in default.
    public static func icon(
        forCategory category: String,
        overrides: [String: CategoryIcon] = [:]
    ) -> String {
        iconInfo(forCategory: category, overrides: overrides)
            .emoji(default: categoryIcons[category] ?? "📌")
    }

    public static let cardIcon = "💳"
    public static let cardIconInfo: CategoryIcon = .emoji(cardIcon)

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
