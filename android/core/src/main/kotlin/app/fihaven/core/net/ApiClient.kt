package app.fihaven.core.net

import app.fihaven.core.model.AppData
import app.fihaven.core.model.decodeAppData
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.Entitlement
import app.fihaven.core.model.PromoResult
import app.fihaven.core.model.HouseholdInfo
import app.fihaven.core.model.HouseholdView
import app.fihaven.core.model.HouseholdSharedData
import app.fihaven.core.model.HouseholdRollup
import app.fihaven.core.model.SharedEntity
import app.fihaven.core.model.HouseholdEnvelope
import app.fihaven.core.model.SharedEntityEnvelope
import app.fihaven.core.model.CreateHouseholdBody
import app.fihaven.core.model.HouseholdInviteBody
import app.fihaven.core.model.HouseholdAcceptBody
import app.fihaven.core.model.ShareEntityBody
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/// Talks to the FiHaven REST API with token/Bearer auth
/// (docs/native-contract.md §3–5). Mirrors the Swift APIClient.
class ApiClient(
    private val config: ApiConfig,
    private val tokens: TokenStore,
    private val transport: HttpTransport = DefaultHttpTransport(),
) {
    // ── request building (internal so tests can assert it) ───────────
    internal fun makeRequest(
        path: String,
        method: HttpMethod,
        body: String? = null,
        tokenMode: Boolean = false,
    ): HttpRequest {
        val headers = mutableMapOf<String, String>()
        tokens.get()?.let { headers["Authorization"] = "Bearer $it" }
        if (tokenMode) headers["X-Auth-Mode"] = "token"
        if (body != null) headers["Content-Type"] = "application/json"
        return HttpRequest(method, config.baseUrl.trimEnd('/') + "/" + path, headers, body)
    }

    private suspend fun send(request: HttpRequest): String {
        val resp = try {
            transport.send(request)
        } catch (e: ApiError) {
            throw e
        } catch (e: Exception) {
            throw ApiError.Transport(e.message ?: "transport error")
        }
        if (resp.status !in 200..299) {
            val code = runCatching {
                FiHavenJson.decodeFromString(ErrorBody.serializer(), resp.body).error
            }.getOrNull()
            // Only bearer/session expiry uses Unauthenticated; login/MFA/passkey
            // 401s carry specific { error } codes (invalid-credentials, etc.).
            if (resp.status == 401 && (code == null || code == "unauthenticated")) {
                throw ApiError.Unauthenticated
            }
            throw ApiError.Http(resp.status, code)
        }
        return resp.body
    }

    private inline fun <reified T> decode(body: String): T =
        try {
            FiHavenJson.decodeFromString<T>(body)
        } catch (e: Exception) {
            throw ApiError.Decoding(e.message ?: "decode error")
        }

    private inline fun <reified T> encode(value: T): String = FiHavenJson.encodeToString(value)

    // ── Auth ─────────────────────────────────────────────────────────
    suspend fun signup(email: String, password: String, captchaToken: String, loginStartedAt: Long): AuthSession {
        val body = encode(LoginRequest(email, password, captchaToken, loginStartedAt))
        return storeSession(send(makeRequest("api/auth/signup", HttpMethod.POST, body, tokenMode = true)))
    }

    suspend fun login(email: String, password: String, captchaToken: String, loginStartedAt: Long): LoginOutcome {
        val body = encode(LoginRequest(email, password, captchaToken, loginStartedAt))
        val response = send(makeRequest("api/auth/login", HttpMethod.POST, body, tokenMode = true))
        val mfa = runCatching { decode<MfaResponse>(response) }.getOrNull()
        if (mfa?.mfaRequired == true) {
            return LoginOutcome.MfaRequired(MfaChallenge(mfa.mfaToken ?: "", mfa.methods ?: emptyList()))
        }
        return LoginOutcome.Authenticated(storeSession(response))
    }

    suspend fun verifyMfa(mfaToken: String, code: String): AuthSession {
        val body = encode(MfaVerifyRequest(mfaToken, code))
        return storeSession(send(makeRequest("api/auth/mfa/verify", HttpMethod.POST, body, tokenMode = true)))
    }

    /** Exchange a provider OIDC ID token (apple|google) for a session. A
     *  federated provider is the auth factor, so this never returns MFA. */
    suspend fun oauthSignIn(provider: String, idToken: String, name: String? = null): AuthSession {
        val body = encode(OAuthSignInBody(idToken, name))
        return storeSession(send(makeRequest("api/auth/oauth/$provider", HttpMethod.POST, body, tokenMode = true)))
    }

    suspend fun sendEmailCode(mfaToken: String) {
        send(makeRequest("api/auth/mfa/email/send", HttpMethod.POST, encode(MfaTokenRequest(mfaToken))))
    }

    suspend fun me(): User? = decode<MeResponse>(send(makeRequest("api/auth/me", HttpMethod.GET))).user

    // ── Passkey login (passwordless first factor) ────────────────────
    // Start returns a challenge id + the raw WebAuthn options for Credential
    // Manager; finish posts the authenticator's assertion JSON and yields a
    // session (no password). The server resolves the account from the signed
    // credential id, so no email is needed up front.
    suspend fun passkeyLoginStart(): PasskeyLoginStartResponse =
        decode(send(makeRequest("api/auth/passkey/login/start", HttpMethod.POST, "{}", tokenMode = true)))

    suspend fun passkeyLoginFinish(challengeId: String, responseJson: String): AuthSession {
        val resp = FiHavenJson.parseToJsonElement(responseJson)
        val body = encode(PasskeyLoginFinishBody(challengeId, resp))
        return storeSession(send(makeRequest("api/auth/passkey/login/finish", HttpMethod.POST, body, tokenMode = true)))
    }

    /** Re-send the email-verification message for the current session. */
    suspend fun resendVerification() {
        send(makeRequest("api/auth/resend-verification", HttpMethod.POST))
    }

    /** Mark first-run onboarding complete (CSRF is skipped for Bearer auth). */
    suspend fun markOnboarded() {
        send(makeRequest("api/account/onboarded", HttpMethod.POST))
    }

    // ── Plaid (bank linking, Pro-gated) ──────────────────────────────
    suspend fun plaidStatus(): PlaidStatus =
        decode(send(makeRequest("api/plaid/status", HttpMethod.GET)))

    // Pass itemId for an update-mode token (re-auth an existing item). Set
    // accountSelection for the NEW_ACCOUNTS_AVAILABLE "add accounts" flow.
    suspend fun plaidLinkToken(itemId: Int? = null, accountSelection: Boolean = false): String {
        val req = if (itemId != null)
            makeRequest("api/plaid/link/token", HttpMethod.POST,
                encode(PlaidLinkTokenBody(itemId, if (accountSelection) true else null)))
        else makeRequest("api/plaid/link/token", HttpMethod.POST)
        return decode<PlaidLinkTokenResponse>(send(req)).linkToken
    }

    suspend fun plaidExchange(publicToken: String) {
        send(makeRequest("api/plaid/link/exchange", HttpMethod.POST, encode(PlaidExchangeBody(publicToken))))
    }

    // After a successful update-mode Link, mark the item repaired.
    suspend fun plaidRepaired(itemId: Int) {
        send(makeRequest("api/plaid/item/$itemId/repaired", HttpMethod.POST))
    }

    suspend fun plaidRemove(itemId: Int) {
        send(makeRequest("api/plaid/item/$itemId/remove", HttpMethod.POST))
    }

    suspend fun plaidRefresh(): List<PlaidItem> =
        decode<PlaidItemsResponse>(send(makeRequest("api/plaid/refresh", HttpMethod.POST))).items

    suspend fun logout() {
        runCatching { send(makeRequest("api/auth/logout", HttpMethod.POST)) }
        tokens.clear()
    }

    suspend fun registerPushDevice(platform: String, token: String) {
        val body = buildJsonObject {
            put("platform", platform)
            put("token", token)
        }.toString()
        send(makeRequest("api/push/register", HttpMethod.POST, body))
    }

    suspend fun unregisterPushDevice(token: String) {
        val body = buildJsonObject { put("token", token) }.toString()
        send(makeRequest("api/push/unregister", HttpMethod.POST, body))
    }

    private fun storeSession(body: String): AuthSession {
        val r = decode<SessionResponse>(body)
        val token = r.token ?: throw ApiError.Decoding("missing token in auth response")
        tokens.set(token)
        return AuthSession(token, r.user)
    }

    // ── Data sync ─────────────────────────────────────────────────────
    suspend fun fetchData(): AppData = decodeAppData(send(makeRequest("api/data", HttpMethod.GET)))

    suspend fun saveData(data: AppData) {
        val body = encode(DataPutBody(
            data.bills, data.cards, data.payments,
            data.accounts, data.goals, data.transactions, data.settings,
        ))
        send(makeRequest("api/data", HttpMethod.PUT, body))
    }

    // ── Billing / entitlement ─────────────────────────────────────────
    suspend fun billingStatus(): Entitlement = billingStatusFull().entitlement

    suspend fun billingStatusFull(): BillingStatusResponse =
        decode(send(makeRequest("api/billing/status", HttpMethod.GET)))

    suspend fun createStripePortal(): String =
        decode<StripePortalResponse>(send(makeRequest("api/billing/stripe/portal", HttpMethod.POST))).url

    suspend fun verifyGoogle(productId: String, purchaseToken: String, expiryTimeMillis: Long? = null): Entitlement =
        decode<EntitlementResponse>(
            send(makeRequest("api/billing/google/verify", HttpMethod.POST,
                encode(GoogleVerifyBody(productId, purchaseToken, expiryTimeMillis))))
        ).entitlement

    /** Redeem a server promo code. Throws ApiError.Http(409, …) for
     *  invalid / exhausted / already-redeemed. */
    suspend fun redeemPromo(code: String): PromoResult =
        decode(send(makeRequest("api/billing/promo/redeem", HttpMethod.POST, encode(PromoRedeemBody(code)))))

    // ── Households (couples / families) ───────────────────────────────
    suspend fun getHousehold(): HouseholdInfo =
        decode(send(makeRequest("api/household", HttpMethod.GET)))

    suspend fun createHousehold(name: String): HouseholdView =
        decode<HouseholdEnvelope>(send(makeRequest("api/household", HttpMethod.POST, encode(CreateHouseholdBody(name))))).household

    suspend fun inviteToHousehold(email: String): HouseholdView =
        decode<HouseholdEnvelope>(send(makeRequest("api/household/invite", HttpMethod.POST, encode(HouseholdInviteBody(email))))).household

    suspend fun acceptHouseholdInvite(token: String): HouseholdView =
        decode<HouseholdEnvelope>(send(makeRequest("api/household/accept", HttpMethod.POST, encode(HouseholdAcceptBody(token))))).household

    suspend fun removeHouseholdMember(userId: Int): HouseholdView =
        decode<HouseholdEnvelope>(send(makeRequest("api/household/members/$userId", HttpMethod.DELETE))).household

    suspend fun revokeHouseholdInvite(id: Int): HouseholdView =
        decode<HouseholdEnvelope>(send(makeRequest("api/household/invites/$id", HttpMethod.DELETE))).household

    suspend fun leaveHousehold() {
        send(makeRequest("api/household/leave", HttpMethod.POST))
    }

    suspend fun getHouseholdSharedData(): HouseholdSharedData =
        decode(send(makeRequest("api/household/data", HttpMethod.GET)))

    suspend fun getHouseholdRollup(): HouseholdRollup? =
        runCatching { decode<HouseholdRollup>(send(makeRequest("api/household/rollup", HttpMethod.GET))) }.getOrNull()

    suspend fun shareHouseholdEntity(kind: String, item: JsonElement): SharedEntity =
        decode<SharedEntityEnvelope>(send(makeRequest("api/household/entities", HttpMethod.POST, encode(ShareEntityBody(kind, item))))).entity

    suspend fun deleteHouseholdEntity(kind: String, id: String) {
        send(makeRequest("api/household/entities/$kind/$id", HttpMethod.DELETE))
    }

    // ── Profile ──────────────────────────────────────────────────────
    suspend fun changeName(name: String): String? =
        decode<NameResult>(send(makeRequest("api/account/change-name", HttpMethod.POST, encode(ChangeNameBody(name))))).name

    suspend fun changeEmail(password: String, newEmail: String): EmailResult =
        decode(send(makeRequest("api/account/change-email", HttpMethod.POST, encode(ChangeEmailBody(password, newEmail)))))

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        send(makeRequest("api/account/change-password", HttpMethod.POST, encode(ChangePasswordBody(currentPassword, newPassword))))
    }

    suspend fun deleteAccount(password: String, code: String = "") {
        send(makeRequest("api/account/delete", HttpMethod.POST, encode(PasswordCodeBody(password, code))))
    }

    /** Erase selected data groups (subset of bills/cards/payments/bank) while
     *  keeping the account + settings. */
    suspend fun clearData(password: String, code: String = "", groups: List<String>) {
        send(makeRequest("api/account/clear-data", HttpMethod.POST, encode(ClearDataBody(password, code, groups))))
    }

    suspend fun exportData(): String = send(makeRequest("api/account/export", HttpMethod.GET))

    // ── MFA ───────────────────────────────────────────────────────────
    suspend fun mfaStatus(): MfaStatus = decode(send(makeRequest("api/account/mfa/status", HttpMethod.GET)))

    suspend fun totpSetup(password: String): TotpSetup =
        decode(send(makeRequest("api/account/mfa/totp/setup", HttpMethod.POST, encode(PasswordBody(password)))))

    suspend fun totpConfirm(code: String): List<String> =
        decode<BackupCodesResult>(send(makeRequest("api/account/mfa/totp/confirm", HttpMethod.POST, encode(CodeBody(code))))).backupCodes

    suspend fun totpDisable(password: String, code: String) {
        send(makeRequest("api/account/mfa/totp/disable", HttpMethod.POST, encode(PasswordCodeBody(password, code))))
    }

    suspend fun regenerateBackupCodes(password: String, code: String): List<String> =
        decode<BackupCodesResult>(send(makeRequest("api/account/mfa/backup-codes/regenerate", HttpMethod.POST, encode(PasswordCodeBody(password, code))))).backupCodes

    suspend fun emailMfaEnable(password: String): String =
        decode<EmailEnableResult>(send(makeRequest("api/account/mfa/email/enable", HttpMethod.POST, encode(PasswordBody(password))))).challengeId

    suspend fun emailMfaConfirm(challengeId: String, code: String) {
        send(makeRequest("api/account/mfa/email/confirm", HttpMethod.POST, encode(EmailConfirmBody(challengeId, code))))
    }

    suspend fun emailMfaDisable(password: String) {
        send(makeRequest("api/account/mfa/email/disable", HttpMethod.POST, encode(PasswordBody(password))))
    }

    suspend fun passkeyRegisterStart(): PasskeyRegisterStartResponse =
        decode(send(makeRequest("api/account/mfa/passkey/register-start", HttpMethod.POST, "{}")))

    suspend fun passkeyRegisterFinish(challengeId: String, responseJson: String, name: String) {
        val resp = FiHavenJson.parseToJsonElement(responseJson)
        send(makeRequest(
            "api/account/mfa/passkey/register-finish",
            HttpMethod.POST,
            encode(PasskeyRegisterFinishBody(challengeId, resp, name)),
        ))
    }

    suspend fun listPasskeys(): List<PasskeyInfo> =
        decode<PasskeyListResult>(send(makeRequest("api/account/mfa/passkey/list", HttpMethod.GET))).passkeys

    suspend fun deletePasskey(id: Int, password: String) {
        send(makeRequest("api/account/mfa/passkey/delete", HttpMethod.POST, encode(PasskeyDeleteBody(id, password))))
    }

    companion object {
        fun now(): Long = System.currentTimeMillis()
    }
}
