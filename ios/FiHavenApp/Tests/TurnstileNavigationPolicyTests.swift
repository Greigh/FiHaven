import XCTest
@testable import FiHaven

/// What the Turnstile WebView is allowed to navigate to.
///
/// The page is a static string of ours, so this isn't about hostile content —
/// it's about keeping the WebView's own surface small. It hands whatever
/// document it shows an injected message handler that reports the captcha
/// token, and that token is what the sign-in request carries, so the set of
/// documents it can reach is worth pinning and worth testing: the policy
/// failing open is a hole, and failing closed breaks sign-in for everyone.
final class TurnstileNavigationPolicyTests: XCTestCase {
    private typealias Policy = TurnstileView.TurnstileNavigationPolicy

    private func allows(_ raw: String?, baseHost: String? = "fihaven.app") -> Bool {
        Policy.allows(raw.flatMap(URL.init(string:)), baseHost: baseHost)
    }

    func testTheChallengeOriginIsAllowed() {
        XCTAssertTrue(allows("https://challenges.cloudflare.com/turnstile/v0/api.js"))
        XCTAssertTrue(allows("https://challenges.cloudflare.com"))
        // Turnstile serves challenge assets off arbitrary subdomains.
        XCTAssertTrue(allows("https://some-region.cloudflare.com/cdn-cgi/challenge-platform/x"))
    }

    func testTheDocumentsOwnBaseURLIsAllowed() {
        // `loadHTMLString(_:baseURL:)` reports the base URL as the document's
        // URL, so denying it would stop the widget from ever starting.
        XCTAssertTrue(allows("https://fihaven.app"))
        XCTAssertTrue(allows("https://fihaven.app/"))
    }

    func testForeignHostsAreDenied() {
        XCTAssertFalse(allows("https://evil.example/turnstile"))
        XCTAssertFalse(allows("http://192.168.1.10/"))
        // A lookalike suffix must not pass a naive `hasSuffix` check.
        XCTAssertFalse(allows("https://cloudflare.com.evil.example/"))
    }

    func testHostIsComparedCaseInsensitively() {
        XCTAssertTrue(allows("https://CHALLENGES.CLOUDFLARE.COM/x"))
        XCTAssertTrue(allows("https://FiHaven.App/"))
    }

    func testNonWebSchemesAndMissingHostsAreNotPinned() {
        // about:blank is where the HTML string lands, and data:/blob: frames
        // are the widget's own — none of them can reach the handler cross-origin.
        XCTAssertTrue(allows("about:blank"))
        XCTAssertTrue(allows("data:text/html,hi"))
        XCTAssertTrue(allows(nil))
    }

    func testAWebURLWithNoHostIsAllowedThrough() {
        // Nothing to match a host against; the alternative would be to cancel
        // navigations we cannot classify.
        XCTAssertTrue(Policy.allows(URL(string: "https://"), baseHost: "fihaven.app"))
    }
}
