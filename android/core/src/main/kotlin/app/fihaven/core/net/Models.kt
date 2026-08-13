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
    // False for Sign in with Apple / Google accounts, which have no password.
    // Re-auth prompts (account deletion) drop the password field when this is
    // false, or those users could never confirm. Defaults true for older
    // payloads that predate the flag.
    val hasPassword: Boolean = true,
    // "user" or "admin", straight from the server. Decides whether the admin
    // console is offered — and that is only cosmetic: every /api/admin/* route
    // enforces the role itself, so a client that lied would just collect 403s.
    // Defaults to the unprivileged role so an older payload can never surface
    // the console by omission.
    val role: String = "user",
) {
    /** Whether to offer the admin console. Never a security boundary. */
    val isAdmin: Boolean get() = role == "admin"
}

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
    /// False for Sign in with Apple / Google accounts, which have no password to
    /// re-enter and confirm sensitive changes with an emailed code instead
    /// (see [ReauthProof]). Defaults true so an older server still decodes.
    val hasPassword: Boolean = true,
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

/**
 * How the user proves it's really them before a sensitive account change.
 *
 * The server accepts either form on the same endpoints: a password when the
 * account has one, otherwise a one-time code from
 * `POST /api/account/mfa/reauth/send`. Modelling it as one type keeps every
 * call site from branching on the account kind itself.
 */
sealed interface ReauthProof {
    data class Password(val value: String) : ReauthProof
    data class EmailedCode(val value: String) : ReauthProof

    val isEmpty: Boolean
        get() = when (this) {
            is Password -> value.isEmpty()
            is EmailedCode -> value.trim().isEmpty()
        }
}

/**
 * Wire form of [ReauthProof]. `encodeDefaults = false` (the kotlinx default)
 * omits the null member, so exactly one of the two keys is sent.
 */
@Serializable
data class ReauthBody(val password: String? = null, val reauthCode: String? = null) {
    companion object {
        fun of(proof: ReauthProof): ReauthBody = when (proof) {
            is ReauthProof.Password -> ReauthBody(password = proof.value)
            is ReauthProof.EmailedCode -> ReauthBody(reauthCode = proof.value.trim())
        }
    }
}

/** Re-auth plus a second-factor code (TOTP / backup code). */
@Serializable
data class ReauthCodeBody(
    val password: String? = null,
    val reauthCode: String? = null,
    val code: String,
) {
    companion object {
        fun of(proof: ReauthProof, code: String): ReauthCodeBody {
            val b = ReauthBody.of(proof)
            return ReauthCodeBody(b.password, b.reauthCode, code)
        }
    }
}

/** Re-auth plus a passkey id. */
@Serializable
data class PasskeyDeleteReauthBody(
    val passkeyId: Int,
    val password: String? = null,
    val reauthCode: String? = null,
) {
    companion object {
        fun of(passkeyId: Int, proof: ReauthProof): PasskeyDeleteReauthBody {
            val b = ReauthBody.of(proof)
            return PasskeyDeleteReauthBody(passkeyId, b.password, b.reauthCode)
        }
    }
}
// `confirm` is the typed phrase; it is what authorizes deletion for Apple/Google
// accounts, which have no password to re-enter.
@Serializable data class DeleteAccountBody(val password: String, val code: String, val confirm: String)
@Serializable data class EmailConfirmBody(val challengeId: String, val code: String)

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
/** `GET /api/billing/status`. The web checkout is Paddle, not Stripe — the
 *  server stopped sending `stripePortal` (and `POST /api/billing/stripe/portal`
 *  no longer exists), so the old field silently defaulted to false forever and
 *  a web subscriber saw no way to manage their subscription. */
@Serializable data class BillingStatusResponse(
    val entitlement: Entitlement,
    val paddlePortal: Boolean = false,
)
@Serializable data class PortalResponse(val url: String)
@Serializable data class GoogleVerifyBody(
    val productId: String,
    val purchaseToken: String,
    val expiryTimeMillis: Long? = null,
)
@Serializable data class OAuthSignInBody(val idToken: String, val name: String? = null)
@Serializable data class OAuthHandoffBody(val handoffCode: String, val state: String? = null)
@Serializable
data class ClearDataBody(
    val password: String? = null,
    val reauthCode: String? = null,
    val code: String,
    val groups: List<String>,
) {
    companion object {
        fun of(proof: ReauthProof, code: String, groups: List<String>): ClearDataBody {
            val b = ReauthBody.of(proof)
            return ClearDataBody(b.password, b.reauthCode, code, groups)
        }
    }
}
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
@Serializable data class PlaidLinkTokenBody(
    val itemId: Int? = null,
    val accountSelection: Boolean? = null,
    val platform: String = "android",
)

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

// ── Admin console (the /api/admin routes, server/routes/admin.js) ──
// Every route behind these models is mounted with `requireAuth,
// requireAdmin` on the server; the role is seeded from ADMIN_EMAILS at
// boot. Nothing here is a permission check — hiding the console from a
// non-admin is a courtesy, and calling anyway just returns 403.
// (Line comments deliberately: Kotlin nests block comments, and a path
// ending in a wildcard would open one that never closes.)

/** One row of the admin user list. */
@Serializable
data class AdminUser(
    val id: Int,
    val email: String,
    val name: String? = null,
    val role: String = "user",
    val createdAt: Double? = null,
    // A credential was presented — password, passkey, OAuth, or the signup.
    val lastLoginAt: Double? = null,
    // How that sign-in was proven: password | passkey | oauth-* | signup.
    val lastLoginMethod: String? = null,
    // Any authenticated request on an existing session (app open, sync).
    val lastSeenAt: Double? = null,
    // Last time the saved data blob actually changed.
    val lastUsedAt: Double? = null,
    val pro: Boolean = false,
    val proSource: String? = null,
    val proPlan: String? = null,
    val proExpiresAt: Double? = null,
    // Whether this console handed out something it can pull back (a comp
    // grant or promo). Store subscriptions are cancelled at the store.
    val revocable: Boolean = false,
    val suspended: Boolean = false,
    val suspendedAt: Double? = null,
    val suspendedReason: String? = null,
) {
    val isAdmin: Boolean get() = role == "admin"
}

@Serializable
data class AdminUsersPage(
    val users: List<AdminUser> = emptyList(),
    val total: Int = 0,
    val limit: Int = 25,
    val page: Int = 1,
    val pages: Int = 1,
    /** Comp plans this server accepts for a grant. */
    val plans: List<String> = emptyList(),
)

@Serializable
data class AdminPromo(
    val code: String,
    val kind: String = "free_sub",
    /** Tier the code redeems into; null for older codes that grant plain Pro. */
    val plan: String? = null,
    val grantDays: Int? = null,
    val maxRedemptions: Int? = null,
    val redeemedCount: Int = 0,
    val expiresAt: Double? = null,
    val note: String? = null,
    val createdAt: Double? = null,
    val active: Boolean = true,
    /** Active, unexpired and not exhausted — someone could use it right now. */
    val redeemable: Boolean = false,
    val expired: Boolean = false,
    val exhausted: Boolean = false,
)

@Serializable data class AdminPromosResponse(val promos: List<AdminPromo> = emptyList())
@Serializable data class AdminPromoResponse(val promo: AdminPromo)

@Serializable
data class AdminPromoBody(
    val code: String? = null,
    val plan: String? = null,
    val grantDays: Int,
    val note: String? = null,
    val maxRedemptions: Int? = null,
)

/** A rewards-catalog row as the admin editor sees it. Separate from
 *  [CardPresetDto] because the editor round-trips values the calculator
 *  never writes back. */
@Serializable
data class AdminCardPreset(
    val id: String = "",
    val issuer: String = "",
    val name: String = "",
    val network: String = "",
    val rewardBase: Double = 1.0,
    val rewardCategories: Map<String, Double> = emptyMap(),
    val rotatingRate: Double? = null,
    val rotatingPool: List<String>? = null,
    val pointValue: Double? = null,
    val updatedAt: Double? = null,
) {
    val label: String get() = "$issuer $name".trim()
}

@Serializable
data class AdminPresetsPage(
    val presets: List<AdminCardPreset> = emptyList(),
    val issuers: List<String> = emptyList(),
    val total: Int = 0,
    val limit: Int = 50,
    val page: Int = 1,
    val pages: Int = 1,
)

@Serializable data class AdminPresetResponse(val preset: AdminCardPreset)
@Serializable data class AdminRoleBody(val role: String)
@Serializable data class AdminProBody(val grant: Boolean, val plan: String? = null, val days: Int? = null)
@Serializable data class AdminSuspendBody(val suspend: Boolean, val reason: String? = null)
@Serializable data class AdminDeleteUserBody(val confirmEmail: String)
@Serializable data class AdminSessionsCleared(val sessionsCleared: Int = 0)
