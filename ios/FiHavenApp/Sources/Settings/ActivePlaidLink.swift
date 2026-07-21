import Foundation
import LinkKit

/// Holds the in-flight Plaid Link handler so a Universal Link OAuth return
/// (`https://fihaven.app/plaid?…`) can call `resumeAfterTermination`.
enum ActivePlaidLink {
    static var handler: Handler?

    /// Resume Link after an OAuth bank redirect. Returns true when the URL
    /// looked like our Plaid Universal Link target (even if no handler is live).
    @discardableResult
    static func resume(from url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        let isOurHost = host == "fihaven.app" || host.hasSuffix(".fihaven.app")
        guard isOurHost, url.path == "/plaid" || url.path.hasPrefix("/plaid/") else {
            return false
        }
        handler?.resumeAfterTermination(from: url)
        return true
    }

    static func clear() {
        handler = nil
    }
}
