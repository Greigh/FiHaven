import Foundation

/// Lenient decoders. Old account data may store a field as a string
/// ("1450") where newer data stores a number, or omit a field entirely.
/// The web client papers over this with `parseFloat`/`||` defaults; these
/// helpers do the same so a native decode never throws on real data.
extension KeyedDecodingContainer {
    func flexibleDouble(_ key: Key) -> Double? {
        if let d = try? decode(Double.self, forKey: key) { return d }
        if let s = try? decode(String.self, forKey: key) { return Double(s) }
        return nil
    }

    func flexibleInt(_ key: Key) -> Int? {
        if let i = try? decode(Int.self, forKey: key) { return i }
        if let d = try? decode(Double.self, forKey: key) { return Int(d) }
        if let s = try? decode(String.self, forKey: key) {
            if let i = Int(s) { return i }
            if let d = Double(s) { return Int(d) }
        }
        return nil
    }

    func flexibleBool(_ key: Key) -> Bool? {
        if let b = try? decode(Bool.self, forKey: key) { return b }
        if let d = try? decode(Double.self, forKey: key) { return d != 0 }
        if let s = try? decode(String.self, forKey: key) {
            return (s as NSString).boolValue
        }
        return nil
    }

    func flexibleString(_ key: Key) -> String? {
        if let s = try? decode(String.self, forKey: key) { return s }
        if let d = try? decode(Double.self, forKey: key) {
            // Render integer-valued doubles without a trailing ".0".
            if d == d.rounded() { return String(Int(d)) }
            return String(d)
        }
        return nil
    }
}
