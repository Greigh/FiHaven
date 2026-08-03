import Foundation

/// MFA enrollment summary from `GET /api/account/mfa/status`.
public struct MfaStatus: Codable, Equatable, Sendable {
    public struct Totp: Codable, Equatable, Sendable {
        public var enabled: Bool
        public var enabledAt: Double?
        public var lastUsedAt: Double?
    }
    public struct BackupCodes: Codable, Equatable, Sendable {
        public var total: Int
        public var unused: Int
    }
    public struct EmailMfa: Codable, Equatable, Sendable {
        public var enabled: Bool
        public var email: String?
    }

    public var totp: Totp
    public var passkeys: [PasskeyInfo]
    public var backupCodes: BackupCodes
    public var emailMfa: EmailMfa
    /// False for Sign in with Apple / Google accounts, which have no password
    /// to re-enter. Those confirm sensitive changes with an emailed code
    /// instead — see `ReauthProof`. Optional so an older server (which didn't
    /// send the field) still decodes; absent is treated as "has a password",
    /// matching the previous behaviour.
    public var hasPassword: Bool?
}

/// How the user proves it's really them before a sensitive account change.
///
/// The server accepts either form on the same endpoints: a password when the
/// account has one, otherwise a one-time code emailed via
/// `POST /api/account/mfa/reauth/send`. Modelling it as one type keeps every
/// call site from having to branch on the account kind itself.
public enum ReauthProof: Equatable, Sendable {
    case password(String)
    case emailedCode(String)

    /// Whether the user has actually entered anything yet.
    public var isEmpty: Bool {
        switch self {
        case .password(let p): return p.isEmpty
        case .emailedCode(let c): return c.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }
}

public struct PasskeyInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var name: String?
    public var transports: [String]?
    public var createdAt: Double?
    public var lastUsedAt: Double?
}

/// Result of `POST /api/account/mfa/totp/setup`.
public struct TotpSetup: Codable, Equatable, Sendable {
    public var uri: String
    public var qrDataUrl: String
    public var secret: String
}

// ── Wire bodies (internal) ───────────────────────────────────────
struct PasswordBody: Encodable { let password: String }
struct EmptyBody: Encodable {}

/// Wire form of `ReauthProof`. Synthesized `encode(to:)` uses `encodeIfPresent`
/// for optionals, so exactly one of the two keys is sent.
struct ReauthBody: Encodable {
    let password: String?
    let reauthCode: String?
    init(_ proof: ReauthProof) {
        switch proof {
        case .password(let p): password = p; reauthCode = nil
        case .emailedCode(let c): password = nil; reauthCode = c.trimmingCharacters(in: .whitespaces)
        }
    }
}

/// Re-auth plus a second-factor code (TOTP / backup code).
struct ReauthCodeBody: Encodable {
    let password: String?
    let reauthCode: String?
    let code: String
    init(_ proof: ReauthProof, code: String) {
        let b = ReauthBody(proof)
        password = b.password
        reauthCode = b.reauthCode
        self.code = code
    }
}

/// Re-auth plus a passkey id.
struct PasskeyDeleteReauthBody: Encodable {
    let passkeyId: Int
    let password: String?
    let reauthCode: String?
    init(passkeyId: Int, proof: ReauthProof) {
        self.passkeyId = passkeyId
        let b = ReauthBody(proof)
        password = b.password
        reauthCode = b.reauthCode
    }
}
struct ChangeNameBody: Encodable { let name: String }
struct ChangeEmailBody: Encodable { let password: String; let newEmail: String }
struct ChangePasswordBody: Encodable { let currentPassword: String; let newPassword: String }
struct CodeBody: Encodable { let code: String }
struct DeleteAccountBody: Encodable { let password: String; let code: String; let confirm: String }
struct ClearDataBody: Encodable {
    let password: String?
    let reauthCode: String?
    let code: String
    let groups: [String]
    init(proof: ReauthProof, code: String, groups: [String]) {
        let b = ReauthBody(proof)
        password = b.password
        reauthCode = b.reauthCode
        self.code = code
        self.groups = groups
    }
}
struct EmailConfirmBody: Encodable { let challengeId: String; let code: String }

struct OkBody: Decodable { let ok: Bool? }
struct NameResult: Decodable { let name: String? }
public struct EmailResult: Decodable, Sendable {
    public let email: String?
    public let verificationRequired: Bool?
}
struct BackupCodesResult: Decodable { let backupCodes: [String] }
struct EmailEnableResult: Decodable { let challengeId: String }
struct PasskeyListResult: Decodable { let passkeys: [PasskeyInfo] }
