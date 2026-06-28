import AuthenticationServices
import FiHavenCore
import UIKit

/// Drives a passwordless passkey assertion with the platform authenticator
/// (Face ID / Touch ID, iCloud Keychain, or a third-party credential manager
/// like Bitwarden) and returns a WebAuthn assertion shaped for the server.
///
/// Two entry points:
///   • `assertion(…, autoFill: true)` uses **conditional UI** — the passkey is
///     offered in the QuickType bar above the keyboard while the sign-in field
///     is focused, and resolves only if the user picks it.
///   • `autoFill: false` shows the standard modal passkey sheet (explicit tap).
@MainActor
final class PasskeyAuth: NSObject {
    static let shared = PasskeyAuth()

    private var continuation: CheckedContinuation<PasskeyAssertionResponse, Error>?
    private var active: ASAuthorizationController?

    func assertion(challengeB64URL: String, rpId: String, autoFill: Bool) async throws -> PasskeyAssertionResponse {
        guard let challenge = Data(base64URLEncoded: challengeB64URL) else {
            throw PasskeyError.badChallenge
        }
        // Only one in-flight request at a time; cancel any prior one cleanly.
        if continuation != nil { finish(.failure(PasskeyError.superseded)) }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        active = controller

        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont
            if autoFill {
                controller.performAutoFillAssistedRequests()
            } else {
                controller.performRequests()
            }
        }
    }

    private func finish(_ result: Result<PasskeyAssertionResponse, Error>) {
        guard let cont = continuation else { return }
        continuation = nil
        active = nil
        cont.resume(with: result)
    }

    enum PasskeyError: Error { case badChallenge, badAssertion, superseded }
}

extension PasskeyAuth: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            finish(.failure(PasskeyError.badAssertion))
            return
        }
        let inner = PasskeyAssertionResponse.Inner(
            clientDataJSON: assertion.rawClientDataJSON.base64URLEncodedString(),
            authenticatorData: assertion.rawAuthenticatorData.base64URLEncodedString(),
            signature: assertion.signature.base64URLEncodedString(),
            userHandle: assertion.userID.isEmpty ? nil : assertion.userID.base64URLEncodedString()
        )
        let id = assertion.credentialID.base64URLEncodedString()
        finish(.success(PasskeyAssertionResponse(id: id, rawId: id, response: inner)))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish(.failure(error))
    }
}

extension PasskeyAuth: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor()
    }
}

// MARK: - base64url (RFC 4648 §5, no padding) — WebAuthn wire encoding.
extension Data {
    init?(base64URLEncoded s: String) {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b.append("=") }
        guard let d = Data(base64Encoded: b) else { return nil }
        self = d
    }

    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
