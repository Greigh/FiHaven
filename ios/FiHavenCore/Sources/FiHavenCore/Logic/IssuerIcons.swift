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
        "goldman": "goldmansachs",
        // Loyalty programs — what's printed on the card is often the program,
        // not the airline or hotel that backs it.
        "aadvantage": "americanairlines",
        "skymiles": "delta",
        "mileageplus": "unitedairlines",
        "rapidrewards": "southwestairlines",
        "trueblue": "jetblue",
        "bonvoy": "marriott",
        "hiltonhonors": "hilton",
        "diners": "dinersclub",
    ]

    static let keysByLength: [String] = issuerEmoji.keys.sorted { $0.count > $1.count }

    /// Aliases long enough to match inside a longer name ("AAdvantage
    /// Aviator"). Short ones (boa, usb) would fire on unrelated words, so
    /// they stay exact.
    static let aliasKeysByLength: [String] = aliases.keys
        .filter { $0.count >= 5 }
        .sorted { $0.count > $1.count }

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
        for a in aliasKeysByLength where key.contains(a) {
            if let target = aliases[a], IssuerLogos.all[target] != nil { return target }
        }
        return nil
    }

    /// Card networks — every card is one, so they identify an issuer least.
    static let networkKeys: Set<String> = ["visa", "mastercard", "dinersclub", "jcb"]

    /// Brand mark for a card (issuer → name). Loans stay on the 🏦 glyph.
    public static func logo(for card: Card) -> IssuerLogo? {
        guard card.type != "loan" else { return nil }
        let issuer = resolveIssuer(for: card)
        guard let key = logoKey(issuer) ?? logoKey(card.name) else { return nil }

        // "Bilt Mastercard" is a Bilt card, not a Mastercard one. A network
        // mark picked up from the card's name tells you nothing the issuer's
        // own initials wouldn't — so when the user named an issuer, their
        // monogram wins. An issuer that IS the network ("Visa") keeps its logo.
        let named = !(card.issuer?.trimmingCharacters(in: .whitespaces).isEmpty ?? true)
        let normalized = normalize(issuer)
        if networkKeys.contains(key), named, (aliases[normalized] ?? normalized) != key {
            return nil
        }
        return IssuerLogos.all[key]
    }

    /// Monogram for a card with no bundled logo, or nil (loans excluded).
    public static func monogram(for card: Card) -> (text: String, color: UInt32)? {
        guard card.type != "loan" else { return nil }
        let issuer = resolveIssuer(for: card)
        let key = normalize(issuer)
        return IssuerMonograms.monogram(key: key.isEmpty ? normalize(card.name) : key, name: issuer)
    }

    /// Renderable icon: brand logo when bundled, else a monogram chip, else
    /// the emoji stand-in. Mirrors web `issuerIconInfo`.
    public static func iconInfo(for card: Card) -> CategoryIcon {
        if let logo = logo(for: card) {
            return .logo(key: logo.key, emoji: emoji(for: card))
        }
        if let mark = monogram(for: card) {
            return .monogram(text: mark.text, color: mark.color, emoji: emoji(for: card))
        }
        return .emoji(emoji(for: card))
    }
}
