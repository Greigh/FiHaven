package app.fihaven.core.logic

import app.fihaven.core.CTConstants
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon

/**
 * Map a credit-card issuer to a recognizable emoji. The web app also
 * renders real SVG brand logos; native mirrors the emoji layer.
 * Keep in sync with web `issuerIcons.js` and iOS `IssuerIcons`.
 */
object IssuerIcons {
    private val issuerEmoji = mapOf(
        "chase" to "🔵", "jpmorgan" to "🔵", "jpmorganchase" to "🔵",
        "americanexpress" to "🟩", "amex" to "🟩",
        "citi" to "🔴", "citibank" to "🔴",
        "capitalone" to "⬛", "capone" to "⬛",
        "wellsfargo" to "🔴", "wells" to "🔴",
        "bankofamerica" to "🔴", "boa" to "🔴", "bofa" to "🔴",
        "usbank" to "🔵", "usb" to "🔵",
        "discover" to "🟠",
        "bilt" to "🏠",
        "apple" to "🍎",
        "robinhood" to "🟢",
        "fidelity" to "🟢",
        "sofi" to "🟣",
        "paypal" to "🔵",
        "target" to "🎯",
        "visa" to "💳", "mastercard" to "💳",
    )

    private val aliases = mapOf(
        "amex" to "americanexpress",
        "americanexp" to "americanexpress",
        "jpmorgan" to "chase",
        "jpmorganchase" to "chase",
        "citibank" to "citi",
        "capone" to "capitalone",
        "wells" to "wellsfargo",
        "boa" to "bankofamerica",
        "bofa" to "bankofamerica",
        "usb" to "usbank",
    )

    private val keysByLength = issuerEmoji.keys.sortedByDescending { it.length }

    fun normalize(name: String): String =
        name.lowercase().filter { it.isLetterOrDigit() }

    fun resolveIssuer(card: Card): String {
        val issuer = card.issuer?.trim().orEmpty()
        if (issuer.isNotEmpty()) return issuer
        return card.name
    }

    fun brand(name: String): String? {
        val key = normalize(name)
        val canon = aliases[key] ?: key
        issuerEmoji[canon]?.let { return it }
        issuerEmoji[key]?.let { return it }
        for (b in keysByLength) {
            if (canon.contains(b) || key.contains(b)) return issuerEmoji[b]
        }
        return null
    }

    /** Emoji for a card (issuer → name → 💳 / 🏦 for loans). */
    fun emoji(card: Card): String {
        if (card.type == "loan") return CTConstants.loanIcon
        brand(resolveIssuer(card))?.let { return it }
        brand(card.name)?.let { return it }
        return CTConstants.cardIcon
    }

    fun iconInfo(card: Card): CategoryIcon = CategoryIcon.Emoji(emoji(card))
}
