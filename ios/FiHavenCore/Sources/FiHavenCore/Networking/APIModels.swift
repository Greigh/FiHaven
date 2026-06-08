import Foundation

/// Where the app points. Production by default; dev points at the local
/// Express server (see docs/native-contract.md §2).
public struct APIConfig: Sendable {
    public var baseURL: URL

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// https://fihaven.app
    public static let production = APIConfig(
        baseURL: URL(string: "https://fihaven.app")!
    )

    /// Local Express server. Use `http://10.0.2.2:5222/fihaven` from an
    /// Android emulator; `localhost` is fine for the iOS simulator/macOS.
    public static let localhost = APIConfig(
        baseURL: URL(string: "http://localhost:5222")!
    )
}

/// The signed-in user as returned by auth endpoints.
public struct User: Codable, Equatable, Sendable {
    public var email: String
    public var name: String?
    /// Whether the email has been confirmed. The app gates the dashboard
    /// behind this; the server returns `email-unverified` on data calls
    /// until it's true.
    public var emailVerified: Bool

    public init(email: String, name: String?, emailVerified: Bool = true) {
        self.email = email
        self.name = name
        self.emailVerified = emailVerified
    }

    enum CodingKeys: String, CodingKey { case email, name, emailVerified }

    // Tolerant decode: a missing flag (older payloads) is treated as
    // verified so we never falsely lock out a legitimate session.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decode(String.self, forKey: .email)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        emailVerified = try c.decodeIfPresent(Bool.self, forKey: .emailVerified) ?? true
    }
}

/// A successful (token-mode) authentication.
public struct AuthSession: Equatable, Sendable {
    public var token: String
    public var user: User
}

/// A pending second factor after password verification.
public struct MfaChallenge: Equatable, Sendable {
    public var mfaToken: String
    public var methods: [String]   // ⊆ ["passkey","totp","email"]
}

/// The result of signup/login: either signed in, or MFA is required.
public enum LoginOutcome: Equatable, Sendable {
    case authenticated(AuthSession)
    case mfaRequired(MfaChallenge)
}

// ── Wire request bodies ──────────────────────────────────────────

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let captchaToken: String
    let loginStartedAt: Int64
    let website: String
}

struct MfaVerifyRequest: Encodable {
    let mfaToken: String
    let code: String
}

struct MfaTokenRequest: Encodable {
    let mfaToken: String
}

struct DataPutBody: Encodable {
    let bills: [Bill]
    let cards: [Card]
    let payments: [Payment]
    let settings: Settings
}

// ── Wire response bodies ─────────────────────────────────────────

struct SessionResponse: Decodable {
    let user: User
    let csrfToken: String?
    let token: String?
}

struct MfaResponse: Decodable {
    let mfaRequired: Bool?
    let mfaToken: String?
    let methods: [String]?
}

struct MeResponse: Decodable {
    let user: User?
}

struct ErrorBody: Decodable {
    let error: String
}
