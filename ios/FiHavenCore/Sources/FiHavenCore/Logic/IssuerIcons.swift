import Foundation

/// Map a credit-card issuer to a recognizable emoji. The web app also
/// renders real SVG brand logos; native mirrors the emoji layer.
/// Keep in sync with web `issuerIcons.js` and Android `IssuerIcons.kt`.
public enum IssuerIcons {
    static let issuerEmoji: [String: String] = [
        "chase": "🔵", "jpmorgan": "🔵", "jpmorganchase": "🔵",
        "americanexpress": "🟩", "amex": "🟩",
        "citi": "🔴", "citibank": "🔴",
        "capitalone": "⬛", "capone": "⬛",
        "wellsfargo": "🔴", "wells": "🔴",
        "bankofamerica": "🔴", "boa": "🔴", "bofa": "🔴",
        "usbank": "🔵", "usb": "🔵",
        "discover": "🟠",
        "bilt": "🏠",
        "apple": "🍎",
        "robinhood": "🟢",
        "fidelity": "🟢",
        "sofi": "🟣",
        "paypal": "🔵",
        "target": "🎯",
        "visa": "💳", "mastercard": "💳",
    ]

    static let aliases: [String: String] = [
        "amex": "americanexpress",
        "americanexp": "americanexpress",
        "jpmorgan": "chase",
        "jpmorganchase": "chase",
        "citibank": "citi",
        "capone": "capitalone",
        "wells": "wellsfargo",
        "boa": "bankofamerica",
        "bofa": "bankofamerica",
        "usb": "usbank",
    ]

    static let keysByLength: [String] = issuerEmoji.keys.sorted { $0.count > $1.count }

    public static func normalize(_ name: String) -> String {
        name.lowercased().unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0)
        }.map(String.init).joined()
    }

    public static func resolveIssuer(for card: Card) -> String {
        if let issuer = card.issuer, !issuer.trimmingCharacters(in: .whitespaces).isEmpty {
            return issuer
        }
        return card.name
    }

    public static func brand(_ name: String) -> String? {
        let key = normalize(name)
        let canon = aliases[key] ?? key
        if let hit = issuerEmoji[canon] ?? issuerEmoji[key] { return hit }
        for b in keysByLength where canon.contains(b) || key.contains(b) {
            return issuerEmoji[b]
        }
        return nil
    }

    /// Emoji for a card (issuer → name → 💳 / 🏦 for loans).
    public static func emoji(for card: Card) -> String {
        if card.type == "loan" { return "🏦" }
        let issuer = resolveIssuer(for: card)
        if let hit = brand(issuer) { return hit }
        if let hit = brand(card.name) { return hit }
        return CTConstants.cardIcon
    }

    public static func iconInfo(for card: Card) -> CategoryIcon {
        .emoji(emoji(for: card))
    }
}
