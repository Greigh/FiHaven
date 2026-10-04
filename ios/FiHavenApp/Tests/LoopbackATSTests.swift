import XCTest

/// The dev server runs cleartext on loopback — `APIConfig.localhost` is
/// `http://localhost:5222` — and the app ships no ATS exceptions, so local
/// development depends entirely on the OS not applying ATS to loopback.
///
/// That is how it behaves today: this test passes with no
/// `NSAppTransportSecurity` key at all, which is why the key was removed. It
/// is kept as an alarm rather than as coverage of app code — if a future OS
/// starts enforcing ATS on loopback, the simulator build silently loses the
/// dev server, and the failure here says exactly which exception to add back
/// (see the note in project.yml).
///
/// It needs no running server: the assertion is about *how* the load fails. A
/// refused connection is the expected outcome; an ATS block is the regression.
final class LoopbackATSTests: XCTestCase {
    func testLoopbackCleartextIsNotBlockedByATS() async throws {
        for host in ["http://localhost:1/", "http://127.0.0.1:1/"] {
            let url = try XCTUnwrap(URL(string: host))
            do {
                // Nothing should be listening on port 1; if something is, the
                // load succeeded, which is also proof ATS let it through.
                _ = try await URLSession.shared.data(from: url)
            } catch {
                let ns = error as NSError
                XCTAssertEqual(ns.domain, NSURLErrorDomain, "\(host): \(error)")
                XCTAssertNotEqual(
                    ns.code,
                    NSURLErrorAppTransportSecurityRequiresSecureConnection,
                    "ATS now blocks cleartext to \(host); the local dev server "
                        + "is unreachable — add an NSExceptionDomains entry for it"
                )
            }
        }
    }
}
