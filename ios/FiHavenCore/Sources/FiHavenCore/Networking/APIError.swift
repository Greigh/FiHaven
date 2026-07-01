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
            case "invalid-email": return "That email address looks invalid."
            case "weak-password": return "Password must be 10+ characters with a letter and a number."
            case "email-taken": return "An account with that email already exists."
            case "email-unverified": return "Verify your current email before changing it."
            case "mail-send-failed": return "Email updated but we couldn't send a verification link. Try resending from the verify screen."
            case "captcha-failed": return "Captcha verification failed. Please try again."
            case "too-fast", "spam": return "Something went wrong. Please try again."
            case "rate-limited": return "Too many attempts. Please wait and try again."
            case "mfa-token-invalid": return "Your verification session expired. Please sign in again."
            case "invalid-totp-code": return "That code wasn't valid."
            default: return code ?? "Request failed (\(status))."
            }
        }
    }
}
