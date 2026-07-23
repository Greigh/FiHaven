import Foundation

/// Resolved category icon — emoji glyph or a small uploaded image (data URI).
/// Mirrors web `categoryIcons.js` (`parseIconValue` / `categoryIconInfo`).
public enum CategoryIcon: Equatable, Sendable, Hashable {
    case emoji(String)
    case image(dataURI: String)

    /// Soft cap matching web `MAX_ICON_DATA_URI_LEN`.
    public static let maxDataURILength = 12_000

    /// Glyph for text-only contexts; images fall back to `defaultEmoji`.
    public func emoji(default defaultEmoji: String = "📌") -> String {
        switch self {
        case .emoji(let e): return e
        case .image: return defaultEmoji
        }
    }

    /// Parse a stored override value (plain emoji string or `{type,value}` object).
    public static func parse(_ raw: JSONValue?) -> CategoryIcon? {
        guard let raw else { return nil }
        if let s = raw.asString {
            return parseEmoji(s)
        }
        guard let obj = raw.asObject else { return nil }
        let type = obj["type"]?.asString
        let value = obj["value"]?.asString?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty else { return nil }
        if type == "image" {
            return isSafeDataURI(value) ? .image(dataURI: value) : nil
        }
        if type == nil || type == "emoji" {
            return parseEmoji(value)
        }
        return nil
    }

    /// Parse the full `settings.categoryIcons` map.
    public static func parseMap(_ raw: JSONValue?) -> [String: CategoryIcon] {
        guard let obj = raw?.asObject else { return [:] }
        var out: [String: CategoryIcon] = [:]
        for (k, v) in obj {
            if let icon = parse(v) { out[k] = icon }
        }
        return out
    }

    public static func parseEmoji(_ raw: String) -> CategoryIcon? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 16 else { return nil }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") || trimmed.hasPrefix("data:") {
            return nil
        }
        // Reject plain ASCII labels that aren't icons.
        if trimmed.unicodeScalars.allSatisfy({
            CharacterSet.alphanumerics.contains($0) || $0 == " " || $0 == "_" || $0 == "." || $0 == "-"
        }) {
            return nil
        }
        return .emoji(trimmed)
    }

    public static func isSafeDataURI(_ value: String) -> Bool {
        guard value.count <= maxDataURILength else { return false }
        let lower = value.lowercased()
        return lower.hasPrefix("data:image/png;base64,")
            || lower.hasPrefix("data:image/jpeg;base64,")
            || lower.hasPrefix("data:image/jpg;base64,")
            || lower.hasPrefix("data:image/webp;base64,")
            || lower.hasPrefix("data:image/gif;base64,")
            || lower.hasPrefix("data:image/svg+xml;base64,")
    }
}
