package app.fihaven.core

/// Category icons + palette, ported from utils.js (docs/native-contract.md §8).
object CTConstants {
    val categoryIcons: Map<String, String> = mapOf(
        "Housing" to "🏠",
        "Utilities" to "⚡",
        "Subscriptions" to "📱",
        "Insurance" to "🛡️",
        "Loan" to "🏦",
        "Auto" to "🚗",
        "Investment" to "📈",
        "Other" to "📌",
    )

    fun iconForCategory(category: String): String = categoryIcons[category] ?: "📌"

    const val cardIcon = "💳"
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
