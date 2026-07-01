import Foundation

/// Account + MFA management calls (docs/native-contract.md §5). All
/// require Bearer auth; CSRF is auto-satisfied for token clients.
public extension APIClient {
    // ── Profile ──────────────────────────────────────────────────────
    @discardableResult
    func changeName(_ name: String) async throws -> String? {
        let req = try makeRequest(path: "api/account/change-name", method: .POST,
                                  body: AnyEncodable(ChangeNameBody(name: name)))
        return try decode(NameResult.self, from: try await send(req)).name
    }

    @discardableResult
    func changeEmail(password: String, newEmail: String) async throws -> EmailResult {
        let req = try makeRequest(path: "api/account/change-email", method: .POST,
                                  body: AnyEncodable(ChangeEmailBody(password: password, newEmail: newEmail)))
        return try decode(EmailResult.self, from: try await send(req))
    }

    func changePassword(currentPassword: String, newPassword: String) async throws {
        let req = try makeRequest(path: "api/account/change-password", method: .POST,
                                  body: AnyEncodable(ChangePasswordBody(currentPassword: currentPassword, newPassword: newPassword)))
        try await send(req)
    }

    /// Permanently delete the account. `code` is the current TOTP code, sent
    /// when 2FA is enrolled (ignored server-side otherwise).
    func deleteAccount(password: String, code: String = "") async throws {
        let req = try makeRequest(path: "api/account/delete", method: .POST,
                                  body: AnyEncodable(PasswordCodeBody(password: password, code: code)))
        try await send(req)
    }

    /// Erase selected data groups while keeping the account + settings.
    /// `groups` is a subset of ["bills","cards","payments","bank"].
    func clearData(password: String, code: String = "", groups: [String]) async throws {
        let req = try makeRequest(path: "api/account/clear-data", method: .POST,
                                  body: AnyEncodable(ClearDataBody(password: password, code: code, groups: groups)))
        try await send(req)
    }

    /// Raw JSON export bytes from `GET /api/account/export`.
    func exportData() async throws -> Data {
        let req = try makeRequest(path: "api/account/export", method: .GET)
        return try await send(req)
    }

    // ── MFA status ───────────────────────────────────────────────────
    func mfaStatus() async throws -> MfaStatus {
        let req = try makeRequest(path: "api/account/mfa/status", method: .GET)
        return try decode(MfaStatus.self, from: try await send(req))
    }

    // ── TOTP ─────────────────────────────────────────────────────────
    func totpSetup(password: String) async throws -> TotpSetup {
        let req = try makeRequest(path: "api/account/mfa/totp/setup", method: .POST,
                                  body: AnyEncodable(PasswordBody(password: password)))
        return try decode(TotpSetup.self, from: try await send(req))
    }

    /// Confirms TOTP enrolment; returns the one-time backup codes.
    func totpConfirm(code: String) async throws -> [String] {
        let req = try makeRequest(path: "api/account/mfa/totp/confirm", method: .POST,
                                  body: AnyEncodable(CodeBody(code: code)))
        return try decode(BackupCodesResult.self, from: try await send(req)).backupCodes
    }

    func totpDisable(password: String, code: String) async throws {
        let req = try makeRequest(path: "api/account/mfa/totp/disable", method: .POST,
                                  body: AnyEncodable(PasswordCodeBody(password: password, code: code)))
        try await send(req)
    }

    func regenerateBackupCodes(password: String, code: String) async throws -> [String] {
        let req = try makeRequest(path: "api/account/mfa/backup-codes/regenerate", method: .POST,
                                  body: AnyEncodable(PasswordCodeBody(password: password, code: code)))
        return try decode(BackupCodesResult.self, from: try await send(req)).backupCodes
    }

    // ── Email MFA ────────────────────────────────────────────────────
    /// Starts email-MFA enrolment; returns a challengeId to confirm with.
    func emailMfaEnable(password: String) async throws -> String {
        let req = try makeRequest(path: "api/account/mfa/email/enable", method: .POST,
                                  body: AnyEncodable(PasswordBody(password: password)))
        return try decode(EmailEnableResult.self, from: try await send(req)).challengeId
    }

    func emailMfaConfirm(challengeId: String, code: String) async throws {
        let req = try makeRequest(path: "api/account/mfa/email/confirm", method: .POST,
                                  body: AnyEncodable(EmailConfirmBody(challengeId: challengeId, code: code)))
        try await send(req)
    }

    func emailMfaDisable(password: String) async throws {
        let req = try makeRequest(path: "api/account/mfa/email/disable", method: .POST,
                                  body: AnyEncodable(PasswordBody(password: password)))
        try await send(req)
    }

    // ── Passkeys (list/delete; native registration is a later phase) ──
    func listPasskeys() async throws -> [PasskeyInfo] {
        let req = try makeRequest(path: "api/account/mfa/passkey/list", method: .GET)
        return try decode(PasskeyListResult.self, from: try await send(req)).passkeys
    }

    func deletePasskey(id: Int, password: String) async throws {
        let req = try makeRequest(path: "api/account/mfa/passkey/delete", method: .POST,
                                  body: AnyEncodable(PasskeyDeleteBody(passkeyId: id, password: password)))
        try await send(req)
    }
}
