package app.fihaven.core.logic

import app.fihaven.core.CTConstants
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon

/**
 * Map a credit-card issuer to a recognizable mark — a bundled brand logo
 * where we have one ([IssuerLogos]), otherwise an emoji stand-in.
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

    /** Bundled brand-mark key for a name, or null. Mirrors web `findLogoKey`. */
    fun logoKey(name: String): String? {
        val key = normalize(name)
        if (key.isEmpty()) return null
        val canon = aliases[key] ?: key
        if (IssuerLogos.all.containsKey(canon)) return canon
        if (IssuerLogos.all.containsKey(key)) return key
        for (k in IssuerLogos.keysByLength) {
            if (canon.contains(k) || key.contains(k)) return k
        }
        return null
    }

    /** Brand mark for a card (issuer → name). Loans stay on the 🏦 glyph. */
    fun logo(card: Card): IssuerLogo? {
        if (card.type == "loan") return null
        val key = logoKey(resolveIssuer(card)) ?: logoKey(card.name) ?: return null
        return IssuerLogos.all[key]
    }

    /** Renderable icon: brand logo when bundled, else the emoji stand-in. */
    fun iconInfo(card: Card): CategoryIcon {
        val logo = logo(card)
        if (logo != null) return CategoryIcon.Logo(logo.key, emoji(card))
        return CategoryIcon.Emoji(emoji(card))
    }
}
