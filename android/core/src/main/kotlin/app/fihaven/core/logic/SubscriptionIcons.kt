package app.fihaven.core.logic

/**
 * Map a subscription / merchant name to a recognizable emoji. The web app also
 * renders real SVG brand logos, but native mirrors only the emoji layer
 * (per-brand → category → generic). Keep the brand table in sync with the web
 * `subscriptionIcons.js` and iOS `SubscriptionIcons.swift`.
 */
object SubscriptionIcons {
    /** Recognizable per-brand emoji, keyed by the normalized name. */
    val BRAND_EMOJI: Map<String, String> = mapOf(
        "netflix" to "🎬", "disney" to "🏰", "disneyplus" to "🏰", "hulu" to "📺", "max" to "📺",
        "hbomax" to "📺", "hbo" to "📺", "peacock" to "🦚", "paramount" to "⛰️", "paramountplus" to "⛰️",
        "appletv" to "🍏", "appletvplus" to "🍏", "apple" to "🍏",
        "icloud" to "☁️", "icloudstorage" to "☁️", "icloudplus" to "☁️", "googleone" to "☁️",
        "dropbox" to "📦", "onedrive" to "☁️",
        "spotify" to "🎵", "applemusic" to "🎵", "youtubemusic" to "🎵", "pandora" to "🎵",
        "tidal" to "🎵", "music" to "🎵", "deezer" to "🎵",
        "youtube" to "▶️", "youtubepremium" to "▶️", "youtubetv" to "📺", "twitch" to "🎮",
        "xboxgamepass" to "🎮", "playstationplus" to "🎮", "playstation" to "🎮", "nintendo" to "🎮",
        "nintendoswitchonline" to "🎮",
        "amazon" to "📦", "amazonprime" to "📦", "primevideo" to "📦",
        "audible" to "🎧", "kindle" to "📚", "kindleunlimited" to "📚",
        "nyt" to "📰", "nytimes" to "📰", "wsj" to "📰", "washingtonpost" to "📰", "medium" to "📰",
        "theathletic" to "📰",
        "patreon" to "🅿️", "substack" to "📩", "notion" to "📝", "evernote" to "📝", "obsidian" to "📝",
        "adobe" to "🎨", "adobecc" to "🎨", "canva" to "🎨", "figma" to "🎨", "lightroom" to "🎨",
        "onepassword" to "🔐", "bitwarden" to "🔐", "lastpass" to "🔐", "dashlane" to "🔐",
        "nordvpn" to "🛡️", "expressvpn" to "🛡️", "protonvpn" to "🛡️", "proton" to "🛡️",
        "chatgpt" to "🤖", "openai" to "🤖", "claude" to "🤖", "anthropic" to "🤖", "midjourney" to "🤖",
        "perplexity" to "🤖",
        "github" to "🐙", "githubcopilot" to "🐙", "githubpro" to "🐙",
        "peloton" to "🚲", "strava" to "🏃", "calm" to "🧘", "headspace" to "🧘", "fitbit" to "⌚",
        "whoop" to "⌚",
        "crunchyroll" to "🍥", "openbubbles" to "💬", "slack" to "💬", "discord" to "💬", "zoom" to "🎥",
        "microsoft365" to "📎", "office365" to "📎", "microsoft" to "📎", "google" to "🔎",
        "googleworkspace" to "📎",
        "linkedin" to "💼", "grammarly" to "✍️", "duolingo" to "🦉", "masterclass" to "🎓",
        "coursera" to "🎓", "skillshare" to "🎓",
    )

    /** Brand keys, longest first, so "applemusic" wins over "apple". */
    private val brandsByLength: List<String> = BRAND_EMOJI.keys.sortedByDescending { it.length }

    /** Normalize a name for matching: lowercase, strip non-alphanumerics. */
    fun normalize(name: String?): String =
        (name ?: "").lowercase().filter { it in 'a'..'z' || it in '0'..'9' }

    /** The per-brand emoji for a name, or null when no brand matched. */
    fun brand(name: String?): String? {
        val key = normalize(name)
        BRAND_EMOJI[key]?.let { return it }
        for (b in brandsByLength) if (key.contains(b)) return BRAND_EMOJI[b]
        return null
    }

    /** Emoji for a subscription/merchant (per-brand → generic recurring). */
    fun emoji(name: String?, category: String? = null): String =
        brand(name) ?: "🔁"
}
