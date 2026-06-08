package com.danielhipskind.fihaven.core.net

import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.core.model.Entitlement
import com.danielhipskind.fihaven.core.model.Payment
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class User(
    val email: String,
    val name: String? = null,
    // Whether the email is confirmed. The app gates the dashboard behind
    // this; the server returns `email-unverified` on data calls until it's
    // true. Defaults true so an older payload never falsely locks anyone out.
    val emailVerified: Boolean = true,
)

data class AuthSession(val token: String, val user: User)

data class MfaChallenge(val mfaToken: String, val methods: List<String>)

sealed class LoginOutcome {
    data class Authenticated(val session: AuthSession) : LoginOutcome()
    data class MfaRequired(val challenge: MfaChallenge) : LoginOutcome()
}

// ── MFA status (GET /api/account/mfa/status) ─────────────────────
@Serializable
data class MfaStatus(
    val totp: Totp = Totp(),
    val passkeys: List<PasskeyInfo> = emptyList(),
    val backupCodes: BackupCodes = BackupCodes(),
    val emailMfa: EmailMfa = EmailMfa(),
) {
    @Serializable data class Totp(val enabled: Boolean = false, val enabledAt: Double? = null, val lastUsedAt: Double? = null)
    @Serializable data class BackupCodes(val total: Int = 0, val unused: Int = 0)
    @Serializable data class EmailMfa(val enabled: Boolean = false, val email: String? = null)
}

@Serializable
data class PasskeyInfo(
    val id: Int = 0,
    val name: String? = null,
    val transports: List<String>? = null,
    val createdAt: Double? = null,
    val lastUsedAt: Double? = null,
)

@Serializable
data class TotpSetup(val uri: String, val qrDataUrl: String, val secret: String)

// ── Wire request bodies ──────────────────────────────────────────
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val captchaToken: String,
    val loginStartedAt: Long,
    val website: String = "",
)

@Serializable data class MfaVerifyRequest(val mfaToken: String, val code: String)
@Serializable data class MfaTokenRequest(val mfaToken: String)
@Serializable data class PasswordBody(val password: String)
@Serializable data class ChangeNameBody(val name: String)
@Serializable data class ChangeEmailBody(val password: String, val newEmail: String)
@Serializable data class ChangePasswordBody(val currentPassword: String, val newPassword: String)
@Serializable data class CodeBody(val code: String)
@Serializable data class PasswordCodeBody(val password: String, val code: String)
@Serializable data class EmailConfirmBody(val challengeId: String, val code: String)
@Serializable data class PasskeyDeleteBody(val passkeyId: Int, val password: String)

@Serializable
data class DataPutBody(
    val bills: List<Bill>,
    val cards: List<Card>,
    val payments: List<Payment>,
    val settings: JsonObject,
)

// ── Wire response bodies ─────────────────────────────────────────
@Serializable
data class SessionResponse(val user: User, val csrfToken: String? = null, val token: String? = null)

@Serializable
data class MfaResponse(val mfaRequired: Boolean? = null, val mfaToken: String? = null, val methods: List<String>? = null)

@Serializable data class MeResponse(val user: User? = null)
@Serializable data class ErrorBody(val error: String? = null)

// ── Billing ──────────────────────────────────────────────────────
@Serializable data class EntitlementResponse(val entitlement: Entitlement)
@Serializable data class GoogleVerifyBody(
    val productId: String,
    val purchaseToken: String,
    val expiryTimeMillis: Long? = null,
)
@Serializable data class PromoRedeemBody(val code: String)
@Serializable data class NameResult(val name: String? = null)
@Serializable data class EmailResult(val email: String? = null)
@Serializable data class BackupCodesResult(val backupCodes: List<String> = emptyList())
@Serializable data class EmailEnableResult(val challengeId: String)
@Serializable data class PasskeyListResult(val passkeys: List<PasskeyInfo> = emptyList())
