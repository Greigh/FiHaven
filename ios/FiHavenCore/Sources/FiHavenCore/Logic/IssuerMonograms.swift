import Foundation

/// Initials-in-a-chip marks for issuers with no bundled logo.
///
/// Plenty of US card issuers (CareCredit, Mission Lane, Aven, OpenSky,
/// Indigo, LMCU, SoFi, …) have no logo we can license, and drawing our own
/// version of someone's trademark isn't an option. A monogram identifies the
/// card without reproducing a logo, and works for any issuer a user types.
///
/// Keep the text overrides to 2–3 characters: the chip is 22pt, and only iOS
/// shrinks to fit.
///
/// Keep in sync with web `issuerMonograms.js` and Android `IssuerMonograms.kt`.
public enum IssuerMonograms {
    /// Approximate brand colors (0xRRGGBB) for issuers we can't draw. Our own
    /// reading of each palette, used only to tint a monogram chip.
    static let brandColors: [String: UInt32] = [
        "carecredit": 0x0057B8,
        "missionlane": 0x0F4C4C,
        "aven": 0x1C1C1C,
        "opensky": 0x0B6BA8,
        "indigo": 0x4B3C8C,
        "lmcu": 0x004B87,
        "synchrony": 0x003057,
        "sofi": 0x00A9E0,
        "fidelity": 0x368727,
        "charlesschwab": 0x0033A0,
        "ally": 0x7E3F98,
        "usaa": 0x002855,
        "navyfederal": 0x003057,
        "pnc": 0xF58025,
        "truist": 0x582C83,
        "tdbank": 0x54B848,
        "chime": 0x1EC677,
        "affirm": 0x4A4AF4,
        "upgrade": 0x28A0A0,
        "amazon": 0xFF9900,
        "costco": 0xE31837,
        "walmart": 0x0071CE,
        "homedepot": 0xF96302,
        "alaskaairlines": 0x01426A,
        "macys": 0xE21A2C,
        "nordstrom": 0x1A1A1A,
        "breadfinancial": 0x7A2E8E,
        "comenity": 0x7A2E8E,
        "firsttech": 0x00558C,
        "alliant": 0x0075BE,
    ]

    /// Shorthands a brand uses for itself, where initials would read oddly.
    static let brandText: [String: String] = [
        "navyfederal": "NF",
        "tdbank": "TD",
        "carecredit": "CC",
        "missionlane": "ML",
        "lmcu": "LM",
        "opensky": "OS",
    ]

    /// Fallback chip colors — mirrors `CTConstants.cardColors`.
    static let fallbackColors: [UInt32] = [
        0x1A6BFF, 0xC0392B, 0x1A7A4A,
        0x7B3CC0, 0xC06010, 0x007080, 0x8B5A00,
    ]

    /// Company-type suffixes — never part of what a brand is called.
    static let suffixWords: Set<String> = [
        "the", "of", "and", "bank", "banks", "banking",
        "financial", "finance", "card", "cards", "services", "service",
        "corp", "corporation", "inc", "llc", "na", "company", "co", "group",
    ]

    /// Usually filler ("Navy Federal Credit Union") but sometimes the brand
    /// itself ("Care Credit"), so only dropped from a name long enough to
    /// spare them.
    static let softWords: Set<String> = ["credit", "union", "rewards", "rewardscard"]

    /// Split a name into identity-carrying words. Handles punctuation
    /// ("U.S. Bank") and camel case ("CareCredit" → Care, Credit).
    static func words(_ name: String) -> [String] {
        let stripped = name.replacingOccurrences(of: ".", with: "")
        let tokens = stripped.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)

        var all: [String] = []
        for token in tokens {
            let parts = splitCamelCase(token)
            // An internal capital is a word break only when both sides are
            // real words: "CareCredit" splits, "SoFi" doesn't.
            if parts.count > 1, parts.allSatisfy({ $0.count >= 3 }) {
                all.append(contentsOf: parts)
            } else {
                all.append(token)
            }
        }

        var kept = all.filter { !suffixWords.contains($0.lowercased()) }
        if kept.count >= 3 {
            let trimmed = kept.filter { !softWords.contains($0.lowercased()) }
            if !trimmed.isEmpty { kept = trimmed }
        }
        // An issuer called only generic words ("Credit Union") still needs a mark.
        return kept.isEmpty ? all : kept
    }

    private static func splitCamelCase(_ token: String) -> [String] {
        var parts: [String] = []
        var current = ""
        for char in token {
            if char.isUppercase, let last = current.last, last.isLowercase || last.isNumber {
                parts.append(current)
                current = String(char)
            } else {
                current.append(char)
            }
        }
        if !current.isEmpty { parts.append(current) }
        return parts
    }

    /// Monogram text for an issuer name: an acronym if the name starts with
    /// one ("US Bank" → US), otherwise one letter per word, capped at two.
    /// Empty when there's nothing alphanumeric to work with.
    public static func initials(_ name: String) -> String {
        let parts = words(name)
        guard let first = parts.first else { return "" }
        if first.count <= 3, first == first.uppercased(), first.contains(where: { $0.isLetter }) {
            return first
        }
        if parts.count == 1 {
            return String(first.prefix(1)).uppercased()
        }
        return (String(first.prefix(1)) + String(parts[1].prefix(1))).uppercased()
    }

    /// Stable chip color for an issuer with no curated brand color.
    static func fallbackColor(_ key: String) -> UInt32 {
        var hash = 0
        for scalar in key.unicodeScalars {
            hash = (hash &* 31 &+ Int(scalar.value)) % 100_000
        }
        return fallbackColors[hash % fallbackColors.count]
    }

    /// Curated keys, longest first — a user writes "Navy Federal Credit
    /// Union" or "Synchrony Bank", not the bare brand key.
    static let curatedKeysByLength: [String] = Array(Set(brandColors.keys).union(brandText.keys))
        .sorted { $0.count > $1.count }

    /// The curated entry a normalized issuer name belongs to, or "".
    static func curatedKey(_ key: String) -> String {
        guard !key.isEmpty else { return "" }
        if brandColors[key] != nil || brandText[key] != nil { return key }
        for k in curatedKeysByLength where key.contains(k) { return k }
        return ""
    }

    /// Monogram for an issuer, or nil when the name has no usable letters.
    /// `key` is the normalized issuer name; `name` the display string.
    public static func monogram(key: String, name: String) -> (text: String, color: UInt32)? {
        let curated = curatedKey(key)
        let text = brandText[curated] ?? initials(name)
        guard !text.isEmpty else { return nil }
        return (text, brandColors[curated] ?? fallbackColor(key.isEmpty ? text : key))
    }
}
