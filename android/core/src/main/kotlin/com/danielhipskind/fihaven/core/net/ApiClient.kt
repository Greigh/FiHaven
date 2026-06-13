package com.danielhipskind.fihaven.core.net

import com.danielhipskind.fihaven.core.model.AppData
import com.danielhipskind.fihaven.core.model.FiHavenJson
import com.danielhipskind.fihaven.core.model.Entitlement
import com.danielhipskind.fihaven.core.model.PromoResult

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
        if (resp.status == 401) throw ApiError.Unauthenticated
        if (resp.status !in 200..299) {
            val code = runCatching {
                FiHavenJson.decodeFromString(ErrorBody.serializer(), resp.body).error
            }.getOrNull()
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

    suspend fun sendEmailCode(mfaToken: String) {
        send(makeRequest("api/auth/mfa/email/send", HttpMethod.POST, encode(MfaTokenRequest(mfaToken))))
    }

    suspend fun me(): User? = decode<MeResponse>(send(makeRequest("api/auth/me", HttpMethod.GET))).user

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

    // Pass itemId for an update-mode token (re-auth an existing item).
    suspend fun plaidLinkToken(itemId: Int? = null): String {
        val req = if (itemId != null)
            makeRequest("api/plaid/link/token", HttpMethod.POST, encode(PlaidLinkTokenBody(itemId)))
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

    private fun storeSession(body: String): AuthSession {
        val r = decode<SessionResponse>(body)
        val token = r.token ?: throw ApiError.Decoding("missing token in auth response")
        tokens.set(token)
        return AuthSession(token, r.user)
    }

    // ── Data sync ─────────────────────────────────────────────────────
    suspend fun fetchData(): AppData = decode(send(makeRequest("api/data", HttpMethod.GET)))

    suspend fun saveData(data: AppData) {
        val body = encode(DataPutBody(data.bills, data.cards, data.payments, data.settings))
        send(makeRequest("api/data", HttpMethod.PUT, body))
    }

    // ── Billing / entitlement ─────────────────────────────────────────
    suspend fun billingStatus(): Entitlement =
        decode<EntitlementResponse>(send(makeRequest("api/billing/status", HttpMethod.GET))).entitlement

    suspend fun verifyGoogle(productId: String, purchaseToken: String, expiryTimeMillis: Long? = null): Entitlement =
        decode<EntitlementResponse>(
            send(makeRequest("api/billing/google/verify", HttpMethod.POST,
                encode(GoogleVerifyBody(productId, purchaseToken, expiryTimeMillis))))
        ).entitlement

    /** Redeem a server promo code. Throws ApiError.Http(409, …) for
     *  invalid / exhausted / already-redeemed. */
    suspend fun redeemPromo(code: String): PromoResult =
        decode(send(makeRequest("api/billing/promo/redeem", HttpMethod.POST, encode(PromoRedeemBody(code)))))

    // ── Profile ──────────────────────────────────────────────────────
    suspend fun changeName(name: String): String? =
        decode<NameResult>(send(makeRequest("api/account/change-name", HttpMethod.POST, encode(ChangeNameBody(name))))).name

    suspend fun changeEmail(password: String, newEmail: String): String? =
        decode<EmailResult>(send(makeRequest("api/account/change-email", HttpMethod.POST, encode(ChangeEmailBody(password, newEmail))))).email

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        send(makeRequest("api/account/change-password", HttpMethod.POST, encode(ChangePasswordBody(currentPassword, newPassword))))
    }

    suspend fun deleteAccount(password: String) {
        send(makeRequest("api/account/delete", HttpMethod.POST, encode(PasswordBody(password))))
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

    suspend fun listPasskeys(): List<PasskeyInfo> =
        decode<PasskeyListResult>(send(makeRequest("api/account/mfa/passkey/list", HttpMethod.GET))).passkeys

    suspend fun deletePasskey(id: Int, password: String) {
        send(makeRequest("api/account/mfa/passkey/delete", HttpMethod.POST, encode(PasskeyDeleteBody(id, password))))
    }

    companion object {
        fun now(): Long = System.currentTimeMillis()
    }
}
