import Foundation

/// Map a subscription / merchant name to a recognizable emoji. The web app
/// also renders real SVG brand logos, but native mirrors only the emoji layer
/// (per-brand → category → generic). Keep the brand table in sync with the web
/// `subscriptionIcons.js` and Android `SubscriptionIcons.kt`.
public enum SubscriptionIcons {
    /// Recognizable per-brand emoji, keyed by the normalized name.
    static let brandEmoji: [String: String] = [
        "netflix": "🎬", "disney": "🏰", "disneyplus": "🏰", "hulu": "📺", "max": "📺",
        "hbomax": "📺", "hbo": "📺", "peacock": "🦚", "paramount": "⛰️", "paramountplus": "⛰️",
        "appletv": "🍏", "appletvplus": "🍏", "apple": "🍏",
        "icloud": "☁️", "icloudstorage": "☁️", "icloudplus": "☁️", "googleone": "☁️",
        "dropbox": "📦", "onedrive": "☁️",
        "spotify": "🎵", "applemusic": "🎵", "youtubemusic": "🎵", "pandora": "🎵",
        "tidal": "🎵", "music": "🎵", "deezer": "🎵",
        "youtube": "▶️", "youtubepremium": "▶️", "youtubetv": "📺", "twitch": "🎮",
        "xboxgamepass": "🎮", "playstationplus": "🎮", "playstation": "🎮", "nintendo": "🎮",
        "nintendoswitchonline": "🎮",
        "amazon": "📦", "amazonprime": "📦", "primevideo": "📦",
        "audible": "🎧", "kindle": "📚", "kindleunlimited": "📚",
        "nyt": "📰", "nytimes": "📰", "wsj": "📰", "washingtonpost": "📰", "medium": "📰",
        "theathletic": "📰",
        "patreon": "🅿️", "substack": "📩", "notion": "📝", "evernote": "📝", "obsidian": "📝",
        "adobe": "🎨", "adobecc": "🎨", "canva": "🎨", "figma": "🎨", "lightroom": "🎨",
        "onepassword": "🔐", "bitwarden": "🔐", "lastpass": "🔐", "dashlane": "🔐",
        "nordvpn": "🛡️", "expressvpn": "🛡️", "protonvpn": "🛡️", "proton": "🛡️",
        "chatgpt": "🤖", "openai": "🤖", "claude": "🤖", "anthropic": "🤖", "midjourney": "🤖",
        "perplexity": "🤖",
        "github": "🐙", "githubcopilot": "🐙", "githubpro": "🐙",
        "peloton": "🚲", "strava": "🏃", "calm": "🧘", "headspace": "🧘", "fitbit": "⌚",
        "whoop": "⌚",
        "crunchyroll": "🍥", "openbubbles": "💬", "slack": "💬", "discord": "💬", "zoom": "🎥",
        "microsoft365": "📎", "office365": "📎", "microsoft": "📎", "google": "🔎",
        "googleworkspace": "📎",
        "linkedin": "💼", "grammarly": "✍️", "duolingo": "🦉", "masterclass": "🎓",
        "coursera": "🎓", "skillshare": "🎓",
    ]

    /// Brand keys, longest first, so "applemusic" wins over "apple".
    static let brandsByLength: [String] = brandEmoji.keys.sorted { $0.count > $1.count }

    /// Normalize a name for matching: lowercase, strip non-alphanumerics.
    public static func normalize(_ name: String) -> String {
        name.lowercased().unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0)
        }.map(String.init).joined()
    }

    /// The per-brand emoji for a name, or nil when no brand matched.
    public static func brand(_ name: String) -> String? {
        let key = normalize(name)
        if let hit = brandEmoji[key] { return hit }
        for b in brandsByLength where key.contains(b) { return brandEmoji[b] }
        return nil
    }

    /// Emoji for a subscription/merchant (per-brand → category → generic).
    public static func emoji(_ name: String, category: String? = nil) -> String {
        if let hit = brand(name) { return hit }
        return category == "Subscriptions" ? "📱" : "🔁"
    }
}
