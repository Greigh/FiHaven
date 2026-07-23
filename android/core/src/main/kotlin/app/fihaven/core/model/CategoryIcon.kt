package app.fihaven.core.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Resolved category icon — emoji glyph or a small uploaded image (data URI).
 * Mirrors web `categoryIcons.js` (`parseIconValue` / `categoryIconInfo`).
 */
sealed class CategoryIcon {
    data class Emoji(val value: String) : CategoryIcon()
    data class Image(val dataUri: String) : CategoryIcon()

    /** Glyph for text-only contexts; images fall back to [defaultEmoji]. */
    fun emoji(defaultEmoji: String = "📌"): String = when (this) {
        is Emoji -> value
        is Image -> defaultEmoji
    }

    companion object {
        const val MAX_DATA_URI_LENGTH = 12_000

        fun parse(raw: JsonElement?): CategoryIcon? {
            if (raw == null) return null
            when (raw) {
                is JsonPrimitive -> return parseEmoji(raw.contentOrNull)
                is JsonObject -> {
                    val type = (raw["type"] as? JsonPrimitive)?.contentOrNull
                    val value = (raw["value"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
                    if (value.isEmpty()) return null
                    if (type == "image") {
                        return if (isSafeDataUri(value)) Image(value) else null
                    }
                    if (type == null || type == "emoji") return parseEmoji(value)
                    return null
                }
                else -> return null
            }
        }

        fun parseMap(raw: JsonElement?): Map<String, CategoryIcon> {
            val obj = raw as? JsonObject ?: return emptyMap()
            val out = mutableMapOf<String, CategoryIcon>()
            for ((k, v) in obj) {
                parse(v)?.let { out[k] = it }
            }
            return out
        }

        fun parseEmoji(raw: String?): CategoryIcon? {
            val trimmed = raw?.trim().orEmpty()
            if (trimmed.isEmpty() || trimmed.length > 16) return null
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
                return null
            }
            if (trimmed.all { it.isLetterOrDigit() || it == ' ' || it == '_' || it == '.' || it == '-' }) {
                return null
            }
            return Emoji(trimmed)
        }

        fun isSafeDataUri(value: String): Boolean {
            if (value.length > MAX_DATA_URI_LENGTH) return false
            val lower = value.lowercase()
            return lower.startsWith("data:image/png;base64,")
                || lower.startsWith("data:image/jpeg;base64,")
                || lower.startsWith("data:image/jpg;base64,")
                || lower.startsWith("data:image/webp;base64,")
                || lower.startsWith("data:image/gif;base64,")
                || lower.startsWith("data:image/svg+xml;base64,")
        }
    }
}
