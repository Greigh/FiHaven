package app.fihaven.core.net

import app.fihaven.core.model.Account
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.Entitlement
import app.fihaven.core.model.Payment
import app.fihaven.core.model.SavingsGoal
import app.fihaven.core.model.SpendTransaction
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class User(
    val email: String,
    val name: String? = null,
    // Whether the email is confirmed. The app gates the dashboard behind
    // this; the server returns `email-unverified` on data calls until it's
    // true. Defaults true so an older payload never falsely locks anyone out.
    val emailVerified: Boolean = true,
    // Whether first-run onboarding is complete. Server-tracked (shown once
    // across web/iOS/Android). Defaults true so older payloads never
    // falsely re-onboard a session.
    val onboarded: Boolean = true,
    // Epoch-ms when the account was created — powers "Member since" on the
    // profile. null from older payloads that didn't include it.
    val createdAt: Double? = null,
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
    // The server PUT replaces the whole record, so every list must be sent or
    // it's wiped. Accounts/goals/transactions were previously omitted, which
    // erased them whenever Android saved. Include them all.
    val accounts: List<Account>,
    val goals: List<SavingsGoal>,
    val transactions: List<SpendTransaction>,
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
@Serializable data class BillingStatusResponse(
    val entitlement: Entitlement,
    val stripePortal: Boolean = false,
)
@Serializable data class StripePortalResponse(val url: String)
@Serializable data class GoogleVerifyBody(
    val productId: String,
    val purchaseToken: String,
    val expiryTimeMillis: Long? = null,
)
@Serializable data class OAuthSignInBody(val idToken: String, val name: String? = null)
@Serializable data class OAuthHandoffBody(val handoffCode: String, val state: String? = null)
@Serializable data class ClearDataBody(val password: String, val code: String, val groups: List<String>)
@Serializable data class PromoRedeemBody(val code: String)
@Serializable data class NameResult(val name: String? = null)
@Serializable data class EmailResult(val email: String? = null, val verificationRequired: Boolean = false)
@Serializable data class BackupCodesResult(val backupCodes: List<String> = emptyList())
@Serializable data class EmailEnableResult(val challengeId: String)
@Serializable data class PasskeyListResult(val passkeys: List<PasskeyInfo> = emptyList())

// ── Plaid (bank linking) ─────────────────────────────────────────
@Serializable
data class PlaidAccount(
    val accountId: String,
    val name: String? = null,
    val mask: String? = null,
    val type: String? = null,
    val subtype: String? = null,
    val currentBalance: Double? = null,
    val availableBalance: Double? = null,
    val isoCurrency: String? = null,
)

@Serializable
data class PlaidItem(
    val id: Int,
    val institutionName: String = "Bank",
    val institutionId: String? = null,
    val status: String = "active",
    val error: String? = null,
    val accounts: List<PlaidAccount> = emptyList(),
)

@Serializable
data class PlaidStatus(
    val configured: Boolean = false,
    val pro: Boolean = false,
    val items: List<PlaidItem> = emptyList(),
)

// ── Passkey (passwordless first-factor login) ────────────────────
// `options` is the raw WebAuthn request options from the server, forwarded
// verbatim to Credential Manager. `response` (on finish) is the assertion
// JSON the authenticator produced, parsed back into a JSON element.
@Serializable data class PasskeyLoginStartResponse(val challengeId: String, val options: JsonObject)
@Serializable data class PasskeyLoginFinishBody(val challengeId: String, val response: JsonElement)
@Serializable data class PasskeyRegisterStartResponse(val challengeId: String, val options: JsonObject)
@Serializable data class PasskeyRegisterFinishBody(val challengeId: String, val response: JsonElement, val name: String)

@Serializable data class PlaidLinkTokenResponse(val linkToken: String)
@Serializable data class PlaidItemsResponse(val items: List<PlaidItem> = emptyList())
@Serializable data class PlaidExchangeBody(@SerialName("public_token") val publicToken: String)
@Serializable data class PlaidLinkTokenBody(val itemId: Int, val accountSelection: Boolean? = null)

/** `GET /api/card-presets` — admin-editable rewards catalog. */
@Serializable
data class CardPresetsResponse(val presets: List<CardPresetDto> = emptyList())

@Serializable
data class CardPresetDto(
    val id: String,
    val issuer: String = "",
    val name: String = "",
    val network: String = "",
    val rewardBase: Double = 0.0,
    val rewardCategories: Map<String, Double> = emptyMap(),
    val rotatingRate: Double? = null,
    val rotatingPool: List<String>? = null,
    val pointValue: Double? = null,
    val updatedAt: Double? = null,
) {
    fun toDomain() = app.fihaven.core.logic.Rewards.CardPreset(
        id = id,
        issuer = issuer,
        name = name,
        network = network,
        rewardBase = rewardBase,
        rewardCategories = rewardCategories,
        rotatingRate = rotatingRate,
        rotatingPool = rotatingPool,
        pointValue = pointValue,
        updatedAt = updatedAt,
    )
}
