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
struct ChangeNameBody: Encodable { let name: String }
struct ChangeEmailBody: Encodable { let password: String; let newEmail: String }
struct ChangePasswordBody: Encodable { let currentPassword: String; let newPassword: String }
struct CodeBody: Encodable { let code: String }
struct PasswordCodeBody: Encodable { let password: String; let code: String }
struct ClearDataBody: Encodable { let password: String; let code: String; let groups: [String] }
struct EmailConfirmBody: Encodable { let challengeId: String; let code: String }
struct PasskeyDeleteBody: Encodable { let passkeyId: Int; let password: String }

struct OkBody: Decodable { let ok: Bool? }
struct NameResult: Decodable { let name: String? }
struct EmailResult: Decodable { let email: String? }
struct BackupCodesResult: Decodable { let backupCodes: [String] }
struct EmailEnableResult: Decodable { let challengeId: String }
struct PasskeyListResult: Decodable { let passkeys: [PasskeyInfo] }
