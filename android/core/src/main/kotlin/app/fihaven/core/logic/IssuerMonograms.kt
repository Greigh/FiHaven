package app.fihaven.core.logic

/**
 * Initials-in-a-chip marks for issuers with no bundled logo.
 *
 * Plenty of US card issuers (CareCredit, Mission Lane, Aven, OpenSky,
 * Indigo, LMCU, SoFi, …) have no logo we can license, and drawing our own
 * version of someone's trademark isn't an option. A monogram identifies the
 * card without reproducing a logo, and works for any issuer a user types.
 *
 * Keep the text overrides to 2–3 characters: the chip is 22dp and Compose
 * clips rather than shrinking.
 *
 * Keep in sync with web `issuerMonograms.js` and iOS `IssuerMonograms.swift`.
 */
object IssuerMonograms {
    /**
     * Approximate brand colors (0xRRGGBB) for issuers we can't draw. Our own
     * reading of each palette, used only to tint a monogram chip.
     */
    private val brandColors = mapOf(
        "carecredit" to 0x0057B8,
        "missionlane" to 0x0F4C4C,
        "aven" to 0x1C1C1C,
        "opensky" to 0x0B6BA8,
        "indigo" to 0x4B3C8C,
        "lmcu" to 0x004B87,
        "synchrony" to 0x003057,
        "sofi" to 0x00A9E0,
        "fidelity" to 0x368727,
        "charlesschwab" to 0x0033A0,
        "ally" to 0x7E3F98,
        "usaa" to 0x002855,
        "navyfederal" to 0x003057,
        "pnc" to 0xF58025,
        "truist" to 0x582C83,
        "tdbank" to 0x54B848,
        "chime" to 0x1EC677,
        "affirm" to 0x4A4AF4,
        "upgrade" to 0x28A0A0,
        "amazon" to 0xFF9900,
        "costco" to 0xE31837,
        "walmart" to 0x0071CE,
        "homedepot" to 0xF96302,
        "alaskaairlines" to 0x01426A,
        "macys" to 0xE21A2C,
        "nordstrom" to 0x1A1A1A,
        "breadfinancial" to 0x7A2E8E,
        "comenity" to 0x7A2E8E,
        "firsttech" to 0x00558C,
        "alliant" to 0x0075BE,
    )

    /** Shorthands a brand uses for itself, where initials would read oddly. */
    private val brandText = mapOf(
        "navyfederal" to "NF",
        "tdbank" to "TD",
        "carecredit" to "CC",
        "missionlane" to "ML",
        "lmcu" to "LM",
        "opensky" to "OS",
    )

    /** Fallback chip colors — mirrors `CTConstants.cardColors`. */
    private val fallbackColors = listOf(
        0x1A6BFF, 0xC0392B, 0x1A7A4A,
        0x7B3CC0, 0xC06010, 0x007080, 0x8B5A00,
    )

    /** Company-type suffixes — never part of what a brand is called. */
    private val suffixWords = setOf(
        "the", "of", "and", "bank", "banks", "banking",
        "financial", "finance", "card", "cards", "services", "service",
        "corp", "corporation", "inc", "llc", "na", "company", "co", "group",
    )

    /**
     * Usually filler ("Navy Federal Credit Union") but sometimes the brand
     * itself ("Care Credit"), so only dropped from a name long enough to
     * spare them.
     */
    private val softWords = setOf("credit", "union", "rewards", "rewardscard")

    /**
     * Split a name into identity-carrying words. Handles punctuation
     * ("U.S. Bank") and camel case ("CareCredit" → Care, Credit).
     */
    internal fun words(name: String): List<String> {
        val tokens = name.replace(".", "").split(Regex("[^A-Za-z0-9]+")).filter { it.isNotEmpty() }

        val all = mutableListOf<String>()
        for (token in tokens) {
            val parts = splitCamelCase(token)
            // An internal capital is a word break only when both sides are
            // real words: "CareCredit" splits, "SoFi" doesn't.
            if (parts.size > 1 && parts.all { it.length >= 3 }) all.addAll(parts) else all.add(token)
        }

        var kept = all.filter { it.lowercase() !in suffixWords }
        if (kept.size >= 3) {
            val trimmed = kept.filter { it.lowercase() !in softWords }
            if (trimmed.isNotEmpty()) kept = trimmed
        }
        // An issuer called only generic words ("Credit Union") still needs a mark.
        return if (kept.isEmpty()) all else kept
    }

    private fun splitCamelCase(token: String): List<String> {
        val parts = mutableListOf<String>()
        val current = StringBuilder()
        for (char in token) {
            val last = current.lastOrNull()
            if (char.isUpperCase() && last != null && (last.isLowerCase() || last.isDigit())) {
                parts.add(current.toString())
                current.setLength(0)
                current.append(char)
            } else {
                current.append(char)
            }
        }
        if (current.isNotEmpty()) parts.add(current.toString())
        return parts
    }

    /**
     * Monogram text for an issuer name: an acronym if the name starts with
     * one ("US Bank" → US), otherwise one letter per word, capped at two.
     * Empty when there's nothing alphanumeric to work with.
     */
    fun initials(name: String): String {
        val parts = words(name)
        val first = parts.firstOrNull() ?: return ""
        if (first.length <= 3 && first == first.uppercase() && first.any { it.isLetter() }) {
            return first
        }
        if (parts.size == 1) return first.take(1).uppercase()
        return (first.take(1) + parts[1].take(1)).uppercase()
    }

    /** Stable chip color for an issuer with no curated brand color. */
    internal fun fallbackColor(key: String): Int {
        var hash = 0
        for (char in key) {
            hash = (hash * 31 + char.code) % 100_000
        }
        return fallbackColors[hash % fallbackColors.size]
    }

    /**
     * Monogram for an issuer, or null when the name has no usable letters.
     * [key] is the normalized issuer name; [name] the display string.
     */
    fun monogram(key: String, name: String): Monogram? {
        val curated = curatedKey(key)
        val text = brandText[curated] ?: initials(name)
        if (text.isEmpty()) return null
        return Monogram(text, brandColors[curated] ?: fallbackColor(key.ifEmpty { text }))
    }

    /**
     * Curated keys, longest first — a user writes "Navy Federal Credit
     * Union" or "Synchrony Bank", not the bare brand key.
     */
    private val curatedKeysByLength = (brandColors.keys + brandText.keys).distinct()
        .sortedByDescending { it.length }

    /** The curated entry a normalized issuer name belongs to, or "". */
    internal fun curatedKey(key: String): String {
        if (key.isEmpty()) return ""
        if (key in brandColors || key in brandText) return key
        for (k in curatedKeysByLength) if (key.contains(k)) return k
        return ""
    }

    /** Initials plus the chip color to draw them on (0xRRGGBB). */
    data class Monogram(val text: String, val color: Int)
}
