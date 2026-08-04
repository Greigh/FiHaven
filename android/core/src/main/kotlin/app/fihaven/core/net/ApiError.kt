package app.fihaven.core.net

/// Errors surfaced by ApiClient. `Http` carries the server's `{ error }`
/// code; `Unauthenticated` (401) means the token is gone → return to login.
sealed class ApiError : Exception() {
    data object Unauthenticated : ApiError()
    data class Http(val status: Int, val code: String?) : ApiError()
    data class Decoding(val detail: String) : ApiError()
    data class Transport(val detail: String) : ApiError()

    val serverCode: String? get() = (this as? Http)?.code

    /// Short human-readable message for the known codes (§3.4).
    val userMessage: String
        get() = when (this) {
            is Unauthenticated -> "Your session expired. Please sign in again."
            is Transport -> when {
                detail.contains("Failed to connect") || detail.contains("ECONNREFUSED") ->
                    "Can't reach the server. For the Android emulator, start the dev server on your computer (port 5222) and try again."
                else -> "Network error: $detail"
            }
            is Decoding -> "Unexpected response from the server."
            is Http -> when (code) {
                "invalid-credentials" -> "Incorrect email or password."
                "invalid-email" -> "That email address looks invalid."
                "weak-password" -> "Password must be 10+ characters with a letter and a number."
                "email-taken" -> "An account with that email already exists."
                "email-unverified" -> "Verify your current email before changing it."
                "mail-send-failed" -> "Email updated but we couldn't send a verification link. Try resending from the verify screen."
                "captcha-failed" -> "Captcha verification failed. Please try again."
                "too-fast", "spam" -> "Something went wrong. Please try again."
                "rate-limited" -> "Too many attempts. Please wait and try again."
                "mfa-token-invalid" -> "Your verification session expired. Please sign in again."
                "invalid-totp-code" -> "That code wasn't valid."
                "mfa-too-many-attempts" -> "Too many incorrect codes. Sign in again to get a new one."
                "mfa-too-many-sends" -> "Too many codes requested. Sign in again to start over."
                "email-unverified-conflict" ->
                    "An unverified account already uses this email. Verify it from the link we emailed, or sign in with your password."
                "account-suspended" -> "This account has been suspended. Contact support if you think that's a mistake."
                "wrong-password" -> "That password is incorrect."
                // Re-auth on an account with no password (Sign in with Apple / Google).
                "reauth-code-required" -> "Send yourself a confirmation code, then enter it to continue."
                "invalid-reauth-code" -> "That confirmation code is incorrect."
                "reauth-code-expired" -> "That confirmation code expired. Request a new one."
                "reauth-too-many-attempts" -> "Too many incorrect codes. Request a new one."
                "password-required" -> "This account has a password — enter it instead."
                "second-factor-required" -> "Enter a code from your authenticator, a backup code, or an emailed code."
                "invalid-second-factor" -> "That code is incorrect or expired."
                "receipt-already-claimed" -> "That purchase is already linked to a different FiHaven account."
                // Only reachable for Play Console license testers; ordinary
                // purchases are never test purchases.
                "test-purchase-rejected" -> "Test purchases aren't being accepted right now."
                "confirm-required" -> "Type DELETE ACCOUNT DATA exactly to confirm."
                "passkey-verify-failed" -> "Passkey verification failed. Try again."
                "bad-challenge", "challenge-expired" -> "That setup session expired. Please try again."
                "bad-passkey-id" -> "Passkey not found."
                "oauth-verify-failed" -> "That sign-in could not be verified. Please try again."
                "oauth-email-unverified" -> "Your Google/Apple account has no verified email."
                "handoff-invalid", "handoff-expired", "handoff-used", "handoff-mismatch" ->
                    "That sign-in link expired. Tap Continue with Google and try again."
                else -> code ?: "Request failed ($status)."
            }
        }
}
