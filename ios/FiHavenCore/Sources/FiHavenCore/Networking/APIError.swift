import Foundation

/// Errors surfaced by APIClient. `http` carries the server's `{ error }`
/// code (e.g. "invalid-credentials") when present; `unauthenticated`
/// (HTTP 401) means the token is gone/expired → return to login.
public enum APIError: Error, Equatable, Sendable {
    case unauthenticated
    case http(status: Int, code: String?)
    case decoding(String)
    case transport(String)

    /// The server's machine-readable error code, when there is one.
    public var serverCode: String? {
        if case .http(_, let code) = self { return code }
        return nil
    }

    /// A short human-readable message for the known codes
    /// (docs/native-contract.md §3.4).
    public var userMessage: String {
        switch self {
        case .unauthenticated:
            return "Your session expired. Please sign in again."
        case .transport(let m):
            return "Network error: \(m)"
        case .decoding:
            return "Unexpected response from the server."
        case .http(let status, let code):
            switch code {
            case "invalid-credentials": return "Incorrect email or password."
            // These all arrive as 401s. Until the client stopped flattening
            // every 401 into .unauthenticated they were unreachable, and each
            // one showed "Your session expired" instead.
            case "wrong-password": return "That password is incorrect."
            case "passkey-verify-failed": return "Passkey verification failed. Try again."
            case "passkey-unknown": return "That passkey isn't registered to an account."
            case "challenge-invalid", "bad-signature": return "That sign-in attempt couldn't be verified. Please try again."
            case "oauth-verify-failed": return "That sign-in couldn't be verified. Please try again."
            case "oauth-email-unverified": return "Your Google or Apple account has no verified email."
            case "confirm-required": return "Type DELETE ACCOUNT DATA exactly to confirm."
            case "invalid-email": return "That email address looks invalid."
            case "weak-password": return "Password must be at least 8 characters with a letter, a number, and a symbol."
            case "email-taken": return "An account with that email already exists."
            case "email-unverified": return "Verify your current email before changing it."
            case "mail-send-failed": return "Email updated but we couldn't send a verification link. Try resending from the verify screen."
            case "captcha-failed": return "Captcha verification failed. Please try again."
            case "too-fast", "spam": return "Something went wrong. Please try again."
            case "rate-limited": return "Too many attempts. Please wait and try again."
            case "mfa-token-invalid": return "Your verification session expired. Please sign in again."
            case "invalid-totp-code": return "That code wasn't valid."
            case "mfa-too-many-attempts": return "Too many incorrect codes. Sign in again to get a new one."
            case "mfa-too-many-sends": return "Too many codes requested. Sign in again to start over."
            case "email-unverified-conflict":
                return "An unverified account already uses this email. Verify it from the link we emailed, or sign in with your password."
            // Re-auth on an account with no password (Sign in with Apple / Google).
            case "reauth-code-required": return "Send yourself a confirmation code, then enter it to continue."
            case "invalid-reauth-code": return "That confirmation code is incorrect."
            case "reauth-code-expired": return "That confirmation code expired. Request a new one."
            case "reauth-too-many-attempts": return "Too many incorrect codes. Request a new one."
            case "password-required": return "This account has a password — enter it instead."
            case "second-factor-required": return "Enter a code from your authenticator, a backup code, or an emailed code."
            case "invalid-second-factor": return "That code is incorrect or expired."
            case "receipt-already-claimed": return "That purchase is already linked to a different FiHaven account."
            case "account-suspended": return "This account has been suspended. Contact support if you think that's a mistake."
            default: return code ?? "Request failed (\(status))."
            }
        }
    }
}
