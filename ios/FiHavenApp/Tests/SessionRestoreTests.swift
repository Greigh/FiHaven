import XCTest
import FiHavenCore
@testable import FiHaven

/// A launch must not end a stored session because the server was briefly
/// unreachable.
///
/// This is the bug: `bootstrap()` found a stored token, `/api/auth/me` failed
/// transiently, and the code fell through to `session = .signedOut` — so a
/// person with a working session, a password they would have to type again, and
/// no explanation, because the network blipped while the app was starting. The
/// token was deliberately *kept*, which made it worse: the next request carried
/// a token the app had already decided was no good.
///
/// The rule under test: the sign-out belongs to a refusal and nothing else.
/// `APIError.isCredentialRejection` is where that is decided, and these are
/// the answers it has to give — including the 401s that arrive as
/// `.http(401, code:)` rather than `.unauthenticated`, which matching on the
/// enum case alone would let through as "transient".
final class SessionRestoreTests: XCTestCase {
    private let userJSON = #"{"email":"dev@example.com","name":null,"emailVerified":true,"onboarded":true,"createdAt":null,"hasPassword":true,"role":"user"}"#

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func client(answer: @escaping (URLRequest) -> (Int, Data)) -> APIClient {
        MockURLProtocol.handler = answer
        return APIClient(
            config: APIConfig(baseURL: URL(string: "https://example.invalid")!),
            tokens: InMemoryTokenStore("stored-token"),
            session: MockURLProtocol.session()
        )
    }

    // MARK: - What counts as a refusal

    func testPlainUnauthenticatedIsARejection() {
        XCTAssertTrue(APIError.unauthenticated.isCredentialRejection)
    }

    /// `send` maps a 401 to `.unauthenticated` only when the body carries no
    /// code or the code `unauthenticated`. Every other 401 arrives as
    /// `.http(401, code:)` — a real refusal the case alone does not catch.
    func testCoded401IsStillARejection() {
        XCTAssertTrue(APIError.http(status: 401, code: "email-unverified").isCredentialRejection)
        XCTAssertTrue(APIError.http(status: 401, code: nil).isCredentialRejection)
    }

    /// These are refusals of the *credential*, which is what a sign-out is
    /// for — not the server being unwell.
    func testCredentialRejectionCodes() {
        for code in ["invalid-credentials", "wrong-password", "mfa-token-invalid"] {
            XCTAssertTrue(APIError.http(status: 401, code: code).isCredentialRejection,
                          "\(code) should retire a stored session")
        }
    }

    /// Everything the server can fail at without having judged the token.
    func testUnreachableAndServerFaultsAreNotRejections() {
        let transient: [APIError] = [
            .transport("The Internet connection appears to be offline."),
            .transport("A server with the specified hostname could not be found."),
            .http(status: 500, code: nil),
            .http(status: 502, code: "bad-gateway"),
            .http(status: 503, code: nil),
            .http(status: 429, code: "rate-limited"),
            .http(status: 404, code: nil),
            .decoding("dataCorrupted")
        ]
        for error in transient {
            XCTAssertFalse(error.isCredentialRejection, "\(error) must not sign a stored session out")
        }
    }

    // MARK: - What the server's answer does to the session

    /// `/api/auth/me` answering "this token belongs to nobody" arrives as a
    /// 200, and is the other refusal.
    func testAnonymousAnswerIsARefusal() async throws {
        let api = client { _ in (200, Data(#"{"user":null}"#.utf8)) }
        let user = try await api.me()
        XCTAssertNil(user)
    }

    func testNamedUserEnters() async throws {
        let api = client { [userJSON] _ in (200, Data(#"{"user":\#(userJSON)}"#.utf8)) }
        let user = try await api.me()
        XCTAssertEqual(user?.email, "dev@example.com")
    }

    /// The failure this change is about, driven through the real client so the
    /// error is the one `send` actually produces. No handler installed is how
    /// `MockURLProtocol` reports "no network", which is exactly the launch
    /// case: the app is offline before it can ask anybody.
    func testOfflineMeIsNotARejection() async {
        MockURLProtocol.reset()
        let api = APIClient(
            config: APIConfig(baseURL: URL(string: "https://example.invalid")!),
            tokens: InMemoryTokenStore("stored-token"),
            session: MockURLProtocol.session()
        )
        do {
            _ = try await api.me()
            XCTFail("expected /api/auth/me to fail while offline")
        } catch let error as APIError {
            XCTAssertFalse(error.isCredentialRejection,
                           "being offline is not the server refusing the token")
        } catch {
            XCTFail("expected an APIError, got \(error)")
        }
    }

    /// A 500 mid-launch must read the same way, for the same reason.
    func testServerFaultMeIsNotARejection() async {
        let api = client { _ in (500, Data(#"{"error":"boom"}"#.utf8)) }
        do {
            _ = try await api.me()
            XCTFail("expected /api/auth/me to fail")
        } catch let error as APIError {
            XCTAssertFalse(error.isCredentialRejection)
        } catch {
            XCTFail("expected an APIError, got \(error)")
        }
    }

    /// A refused token must still read as a refusal through the real client, or
    /// the launch would sit in `.restoring` retrying a credential the server
    /// has already thrown out.
    func testUnauthorizedMeIsARejection() async {
        let api = client { _ in (401, Data(#"{"error":"unauthenticated"}"#.utf8)) }
        do {
            _ = try await api.me()
            XCTFail("expected /api/auth/me to fail")
        } catch let error as APIError {
            XCTAssertTrue(error.isCredentialRejection)
        } catch {
            XCTFail("expected an APIError, got \(error)")
        }
    }

    /// A 401 carrying a *code* is the shape that used to be missed.
    func testCodedUnauthorizedMeIsARejection() async {
        let api = client { _ in (401, Data(#"{"error":"mfa-token-invalid"}"#.utf8)) }
        do {
            _ = try await api.me()
            XCTFail("expected /api/auth/me to fail")
        } catch let error as APIError {
            XCTAssertTrue(error.isCredentialRejection,
                          "a 401 with a code is still the server refusing the token")
        } catch {
            XCTFail("expected an APIError, got \(error)")
        }
    }
}
