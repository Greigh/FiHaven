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
    /// Whether first-run onboarding has been completed. The app shows the
    /// onboarding flow once while this is false (server-tracked, so it's
    /// shown once across web/iOS/Android — not per device).
    public var onboarded: Bool
    /// Epoch-ms when the account was created — powers "Member since" on the
    /// profile. nil from older payloads that didn't include it.
    public var createdAt: Double?

    public init(email: String, name: String?, emailVerified: Bool = true, onboarded: Bool = true, createdAt: Double? = nil) {
        self.email = email
        self.name = name
        self.emailVerified = emailVerified
        self.onboarded = onboarded
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey { case email, name, emailVerified, onboarded, createdAt }

    // Tolerant decode: a missing flag (older payloads) is treated as
    // verified / onboarded so we never falsely lock out or re-onboard a
    // legitimate session.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decode(String.self, forKey: .email)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        emailVerified = try c.decodeIfPresent(Bool.self, forKey: .emailVerified) ?? true
        onboarded = try c.decodeIfPresent(Bool.self, forKey: .onboarded) ?? true
        createdAt = try c.decodeIfPresent(Double.self, forKey: .createdAt)
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

struct OAuthSignInRequest: Encodable {
    let idToken: String
    let name: String?
}

struct DataPutBody: Encodable {
    let bills: [Bill]
    let cards: [Card]
    let payments: [Payment]
    // The server PUT replaces the whole record, so any list left out is wiped.
    // Accounts/goals/transactions were previously omitted, erasing them on
    // every save — always send them.
    let accounts: [Account]
    let goals: [SavingsGoal]
    let transactions: [SpendTransaction]
    let settings: Settings
}

// ── Passkey (passwordless first-factor login) ────────────────────

/// Result of `/passkey/login/start`: a challenge id to echo back plus the
/// WebAuthn challenge (base64url) and rpID the authenticator should sign.
public struct PasskeyLoginStart: Sendable {
    public let challengeId: String
    public let challengeB64URL: String
    public let rpId: String
}

struct PasskeyLoginStartRaw: Decodable {
    let challengeId: String
    let options: Options
    struct Options: Decodable { let challenge: String; let rpId: String? }
}

/// The WebAuthn assertion the client sends to `/passkey/login/finish`,
/// shaped to match `@simplewebauthn/server`'s `AuthenticationResponseJSON`.
public struct PasskeyAssertionResponse: Encodable, Sendable {
    public let id: String
    public let rawId: String
    public let type: String
    public let response: Inner
    public struct Inner: Encodable, Sendable {
        public let clientDataJSON: String
        public let authenticatorData: String
        public let signature: String
        public let userHandle: String?
        public init(clientDataJSON: String, authenticatorData: String, signature: String, userHandle: String?) {
            self.clientDataJSON = clientDataJSON
            self.authenticatorData = authenticatorData
            self.signature = signature
            self.userHandle = userHandle
        }
    }
    public init(id: String, rawId: String, response: Inner, type: String = "public-key") {
        self.id = id; self.rawId = rawId; self.response = response; self.type = type
    }
}

struct PasskeyLoginFinishBody: Encodable {
    let challengeId: String
    let response: PasskeyAssertionResponse
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

// ── Plaid (bank linking) ─────────────────────────────────────────
public struct PlaidAccount: Decodable, Equatable, Sendable, Identifiable {
    public var accountId: String
    public var name: String?
    public var mask: String?
    public var type: String?
    public var subtype: String?
    public var currentBalance: Double?
    public var availableBalance: Double?
    public var isoCurrency: String?
    public var id: String { accountId }
}

public struct PlaidItem: Decodable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var institutionName: String
    public var institutionId: String?
    public var status: String
    public var error: String?
    public var accounts: [PlaidAccount]
}

/// `GET /api/plaid/status`: server credentials present? user Pro? linked items.
public struct PlaidStatus: Decodable, Equatable, Sendable {
    public var configured: Bool
    public var pro: Bool
    public var items: [PlaidItem]
}

struct PlaidLinkTokenResponse: Decodable { let linkToken: String }
struct PlaidItemsResponse: Decodable { let items: [PlaidItem] }
struct PlaidExchangeBody: Encodable {
    let publicToken: String
    enum CodingKeys: String, CodingKey { case publicToken = "public_token" }
}
struct PlaidLinkTokenBody: Encodable {
    let itemId: Int
    var accountSelection: Bool? = nil   // update mode w/ account selection (NEW_ACCOUNTS_AVAILABLE)
}
