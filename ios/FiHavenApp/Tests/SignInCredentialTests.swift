import XCTest
import FiHavenCore
@testable import FiHaven

/// A request that establishes a session must not carry the credential it is
/// replacing.
///
/// This is the bug behind a `FH_AUTOLOGIN=1` run stranding on the auth screen
/// with "Your session expired": `bootstrap()` found a stored session, `/api/auth/me`
/// failed *transiently* (so the token deliberately survived), and `makeRequest`
/// then put that token on the sign-in request itself. The server answered 401
/// `unauthenticated`, the app read that as an expired session, and `bootstrap()`
/// runs once per launch — so nothing ever tried again.
final class SignInCredentialTests: XCTestCase {
    private let userJSON = #"{"email":"dev@example.com","name":null,"emailVerified":true,"onboarded":true,"createdAt":null,"hasPassword":true,"role":"user"}"#
    private var sessionJSON: String { #"{"token":"fresh-token","user":\#(userJSON)}"# }

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func client(tokens: TokenStore) -> APIClient {
        APIClient(
            config: APIConfig(baseURL: URL(string: "https://example.invalid")!),
            tokens: tokens,
            session: MockURLProtocol.session()
        )
    }

    private struct SignIn {
        let path: String
        /// One per endpoint: the shape that endpoint decodes.
        let response: String
        /// Whether the response carries a session. `passkey/login/start` and
        /// the email-code send only set one up, so they leave the store alone.
        let storesSession: Bool
        let run: (APIClient) async throws -> Void
    }

    /// Every endpoint whose whole purpose is to establish a session.
    private var signIns: [SignIn] {
        let session = sessionJSON
        let assertion = PasskeyAssertionResponse(
            id: "credential-id", rawId: "credential-id",
            response: .init(clientDataJSON: "e30", authenticatorData: "AA",
                            signature: "sig", userHandle: nil)
        )
        return [
            SignIn(path: "/api/auth/login", response: session, storesSession: true) { client in
                _ = try await client.login(email: "dev@example.com", password: "pw",
                                           captchaToken: "captcha", loginStartedAt: 0)
            },
            SignIn(path: "/api/auth/signup", response: session, storesSession: true) { client in
                _ = try await client.signup(email: "dev@example.com", password: "pw",
                                            captchaToken: "captcha", loginStartedAt: 0)
            },
            SignIn(path: "/api/auth/oauth/apple", response: session, storesSession: true) { client in
                _ = try await client.oauthSignIn(provider: "apple", idToken: "id-token")
            },
            SignIn(path: "/api/auth/mfa/verify", response: session, storesSession: true) { client in
                _ = try await client.verifyMfa(mfaToken: "mfa-token", code: "123456")
            },
            SignIn(path: "/api/auth/passkey/login/start",
                   response: #"{"challengeId":"cid","options":{"challenge":"chal","rpId":"fihaven.app"}}"#,
                   storesSession: false) { client in
                _ = try await client.passkeyLoginStart()
            },
            SignIn(path: "/api/auth/passkey/login/finish", response: session, storesSession: true) { client in
                _ = try await client.passkeyLoginFinish(challengeId: "cid", response: assertion)
            },
            SignIn(path: "/api/auth/mfa/email/send", response: "{}", storesSession: false) { client in
                try await client.sendEmailCode(mfaToken: "mfa-token")
            },
        ]
    }

    func testSignInRequestsDoNotCarryTheStoredToken() async throws {
        for signIn in signIns {
            let tokens = InMemoryTokenStore("stale-token-from-an-earlier-session")
            MockURLProtocol.handler = { _ in (200, Data(signIn.response.utf8)) }

            _ = try await signIn.run(client(tokens: tokens))

            XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, signIn.path)
            XCTAssertNil(
                MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
                "\(signIn.path) carried the stored token — a server that validates the header would answer 401 and the app would call that an expired session"
            )
            // And a sign-in that returns a session still replaces the token.
            if signIn.storesSession {
                XCTAssertEqual(tokens.get(), "fresh-token", signIn.path)
            }
        }
    }

    /// The exceptions, pinned on purpose: `me()` is *how* a stored session is
    /// validated, and `logout()` needs the token to revoke it.
    func testSessionValidationAndLogoutStillSendTheStoredToken() async throws {
        let tokens = InMemoryTokenStore("live-token")
        let api = client(tokens: tokens)

        MockURLProtocol.handler = { _ in (200, Data(#"{"user":null}"#.utf8)) }
        _ = try await api.me()
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/auth/me")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
                       "Bearer live-token")

        MockURLProtocol.handler = { _ in (200, Data("{}".utf8)) }
        try await api.logout()
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/auth/logout")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
                       "Bearer live-token")
    }
}
