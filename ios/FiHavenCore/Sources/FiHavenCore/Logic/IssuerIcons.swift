import Foundation

/// Map a credit-card issuer to a recognizable mark — a bundled brand logo
/// where we have one (`IssuerLogos`), otherwise an emoji stand-in.
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

    /// Bundled brand-mark key for a name, or nil. Mirrors web `findLogoKey`.
    public static func logoKey(_ name: String) -> String? {
        let key = normalize(name)
        guard !key.isEmpty else { return nil }
        let canon = aliases[key] ?? key
        if IssuerLogos.all[canon] != nil { return canon }
        if IssuerLogos.all[key] != nil { return key }
        for k in IssuerLogos.keysByLength where canon.contains(k) || key.contains(k) {
            return k
        }
        return nil
    }

    /// Brand mark for a card (issuer → name). Loans stay on the 🏦 glyph.
    public static func logo(for card: Card) -> IssuerLogo? {
        guard card.type != "loan" else { return nil }
        guard let key = logoKey(resolveIssuer(for: card)) ?? logoKey(card.name) else { return nil }
        return IssuerLogos.all[key]
    }

    /// Renderable icon: brand logo when bundled, else the emoji stand-in.
    public static func iconInfo(for card: Card) -> CategoryIcon {
        if let logo = logo(for: card) {
            return .logo(key: logo.key, emoji: emoji(for: card))
        }
        return .emoji(emoji(for: card))
    }
}
