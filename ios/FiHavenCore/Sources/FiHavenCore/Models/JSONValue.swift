import Foundation

/// A loss-less JSON value, used to round-trip the open-ended `settings`
/// bag without dropping keys the native app doesn't model. The server
/// stores `settings` verbatim, so preserving unknown keys is essential —
/// otherwise a native save would clobber web-only settings.
public enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let o = try? c.decode([String: JSONValue].self) {
            self = .object(o)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            throw DecodingError.dataCorruptedError(
                in: c, debugDescription: "Unsupported JSON value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        }
    }
}

public extension JSONValue {
    /// Number-ish read: tolerates strings and bools the way JS `parseFloat`/
    /// truthiness does at the call sites in the web client.
    var asDouble: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s)
        case .bool(let b): return b ? 1 : 0
        default: return nil
        }
    }
    var asString: String? {
        if case .string(let s) = self { return s }
        return nil
    }
    var asBool: Bool? {
        switch self {
        case .bool(let b): return b
        case .number(let n): return n != 0
        default: return nil
        }
    }
    var asArray: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }
    var asObject: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }
}
