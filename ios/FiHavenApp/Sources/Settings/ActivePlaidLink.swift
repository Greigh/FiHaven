import Foundation
import LinkKit

/// Holds the in-flight Plaid Link session so it stays alive while Link is on
/// screen, and claims our Plaid OAuth Universal Link
/// (`https://fihaven.app/plaid?…`) so it is never routed to Google Sign-In.
enum ActivePlaidLink {
    static var session: PlaidLinkSession?

    /// Returns true when the URL looked like our Plaid Universal Link target.
    /// LinkKit 7 completes OAuth inside the live session and dropped
    /// `resumeAfterTermination`, so there is nothing to forward the URL to.
    @discardableResult
    static func claims(_ url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        let isOurHost = host == "fihaven.app" || host.hasSuffix(".fihaven.app")
        return isOurHost && (url.path == "/plaid" || url.path.hasPrefix("/plaid/"))
    }

    static func clear() {
        session = nil
    }
}
