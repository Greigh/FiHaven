package app.fihaven.core

import app.fihaven.core.model.CategoryIcon

/// Category icons + palette, ported from utils.js / categoryIcons.js
/// (docs/native-contract.md §8).
object CTConstants {
    val categoryIcons: Map<String, String> = mapOf(
        "Housing" to "🏠",
        "Utilities" to "⚡",
        "Subscriptions" to "🔁",
        "Insurance" to "🛡️",
        "Loan" to "🏦",
        "Auto" to "🚗",
        "Investment" to "📈",
        "Other" to "📌",
    )

    /** Resolve a category icon (emoji or custom image) from settings overrides. */
    fun iconInfoForCategory(
        category: String,
        overrides: Map<String, CategoryIcon> = emptyMap(),
    ): CategoryIcon =
        overrides[category] ?: CategoryIcon.Emoji(categoryIcons[category] ?: "📌")

    /** Emoji-only convenience. Image overrides fall back to the built-in default. */
    fun iconForCategory(
        category: String,
        overrides: Map<String, CategoryIcon> = emptyMap(),
    ): String =
        iconInfoForCategory(category, overrides).emoji(categoryIcons[category] ?: "📌")

    const val cardIcon = "💳"
    val cardIconInfo: CategoryIcon = CategoryIcon.Emoji(cardIcon)
    const val loanIcon = "🏦"

    val categories = listOf(
        "Housing", "Utilities", "Subscriptions",
        "Insurance", "Loan", "Auto", "Investment", "Other",
    )

    val cardColors = listOf(
        "#1A6BFF", "#C0392B", "#1A7A4A",
        "#7B3CC0", "#C06010", "#007080", "#8B5A00",
    )
}
