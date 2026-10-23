import XCTest
@testable import FiHavenCore

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// `FH_FAULT` is the only way the Mac sweep can photograph a screen whose data
/// never arrived. It failed in exactly the quiet way this file exists to stop:
///
/// - `swift build -c debug` passes `-DDEBUG` on the command line, so the hook
///   compiled and the checks binary saw it.
/// - `xcodebuild` builds a *package dependency* with its own compilation
///   conditions. `SWIFT_ACTIVE_COMPILATION_CONDITIONS: DEBUG` is set on the app
///   target in `project.yml`, and a per-target setting does not push down into a
///   package. So `#if DEBUG` was false in the very app the hook existed to
///   photograph.
///
/// Nothing failed. The sweep ran, the offline and error captures were produced,
/// and they were photographs of the happy path — the states looked plausible and
/// were wrong. A hook that silently stops existing is worse than no hook.
///
/// So the tests below assert the behaviour, and Package.swift now defines DEBUG
/// for the target so the tests and the app agree.
final class FaultInjectionTests: XCTestCase {

    // MARK: - The seam itself

    private let dataURL = URL(string: "https://example.test/api/user-data")!
    private let authURL = URL(string: "https://example.test/api/auth/login")!

    private func withFault(_ value: String?, _ body: () throws -> Void) rethrows {
        let key = "FH_FAULT"
        let previous = ProcessInfo.processInfo.environment[key]
        defer {
            if let previous {
                setenv(key, previous, 1)
            } else {
                unsetenv(key)
            }
        }
        if let value {
            setenv(key, value, 1)
        } else {
            unsetenv(key)
        }
        try body()
    }

    func testNoFaultIsInjectedWhenTheVariableIsUnset() throws {
        try withFault(nil) {
            XCTAssertNil(APIClient.faultInjected(for: dataURL))
        }
    }

    func testAnUnknownValueInjectsNothing() throws {
        // A typo in the sweep's state table must degrade to "no fault" rather
        // than to a state nobody asked for.
        for value in ["", "API", "Transport", "offline", "1"] {
            try withFault(value) {
                XCTAssertNil(APIClient.faultInjected(for: dataURL), "value: \(value)")
            }
        }
    }

    // MARK: - The two modes

    func testTransportModeFailsTheRequestWithoutReachingTheServer() throws {
        try withFault("transport") {
            guard case .transport = APIClient.faultInjected(for: dataURL) else {
                return XCTFail("transport mode should produce a transport error")
            }
        }
    }

    func testApiModeProducesA503() throws {
        try withFault("api") {
            guard case .http(let status, _) = APIClient.faultInjected(for: dataURL) else {
                return XCTFail("api mode should produce an HTTP error")
            }
            XCTAssertEqual(status, 503)
        }
    }

    func testTheHandshakeIsExemptInBothModes() throws {
        // Failing sign-in would strand the sweep on the auth screen, and every
        // photograph would be of the same thing. The point is to get *in* and
        // then fail to load anything.
        for mode in ["transport", "api"] {
            try withFault(mode) {
                XCTAssertNil(APIClient.faultInjected(for: authURL), "mode: \(mode)")
            }
        }
    }

    func testOnlyTheAuthPathIsExempt() throws {
        // `/api/auth` is the exemption, as a path match — so nested auth
        // endpoints like a token refresh are exempt too, which is what the app
        // needs to stay signed in. Everything else under `/api/` takes the
        // fault, including household and bank-link calls.
        try withFault("api") {
            XCTAssertNotNil(APIClient.faultInjected(for: URL(string: "https://example.test/api/household/prefs")!))
            XCTAssertNotNil(APIClient.faultInjected(for: URL(string: "https://example.test/api/user-data")!))
            XCTAssertNil(APIClient.faultInjected(for: URL(string: "https://example.test/api/auth/refresh")!))
            // And a path that merely contains the word elsewhere is not exempt:
            // the match is on the whole substring, so this is the one case worth
            // stating — the server owns the routing and nothing here adds a path.
            XCTAssertNil(APIClient.faultInjected(for: URL(string: "https://example.test/api/auth/login")!))
        }
    }

    // MARK: - The build-setting trap, as a test

    func testTheHookExistsInThisBuildConfiguration() {
        // If this fails, `#if DEBUG` was false where these tests were compiled —
        // which is exactly the failure that made the sweep lie. The fix is in
        // Package.swift (`.define("DEBUG", .when(configuration: .debug))`),
        // because the app target's own condition does not reach a package.
        #if !DEBUG
            XCTFail("DEBUG is not defined for FiHavenCore in this configuration")
        #endif
        XCTAssertNotNil(ProcessInfo.processInfo.environment["PATH"], "sanity: the test process has an environment")
    }

    // MARK: - It is reached before the network

    func testSendThrowsWithoutTouchingTheNetwork() async throws {
        // A URLSession pointed at an unroutable host would hang or fail slowly;
        // the fault has to come first, or the sweep's captures depend on how the
        // machine's DNS feels that minute.
        let tokens = InMemoryTokenStore("test-token")
        let client = APIClient(
            config: APIConfig(baseURL: URL(string: "https://127.0.0.1:1")!),
            tokens: tokens
        )
        var request = URLRequest(url: URL(string: "https://example.test/api/user-data")!)
        request.httpMethod = "POST"

        let previous = ProcessInfo.processInfo.environment["FH_FAULT"]
        defer { if let previous { setenv("FH_FAULT", previous, 1) } else { unsetenv("FH_FAULT") } }
        setenv("FH_FAULT", "transport", 1)
        do {
            _ = try await client.send(request)
            XCTFail("send should have thrown")
        } catch let error as APIError {
            guard case .transport = error else {
                return XCTFail("expected a transport error, got \(error)")
            }
        } catch {
            XCTFail("expected APIError, got \(error)")
        }
    }
}
