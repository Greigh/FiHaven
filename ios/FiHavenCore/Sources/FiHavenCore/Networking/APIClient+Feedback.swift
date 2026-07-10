import Foundation

public extension APIClient {
    /// Offer a subscription's manage/cancel link to the shared database.
    /// The server mails it to us with the sender as reply-to; nothing is
    /// stored, so a failure here is never fatal to the user's own save.
    func shareSubscriptionLink(name: String, url: String) async throws {
        let req = try makeRequest(
            path: "api/feedback/subscription-link",
            method: .POST,
            body: AnyEncodable(["name": name, "url": url])
        )
        _ = try await send(req)
    }

    /// Offer a card's rewards/offers link to the shared database. Same
    /// contract as `shareSubscriptionLink` — mailed, never stored.
    func shareRewardsLink(name: String, url: String) async throws {
        let req = try makeRequest(
            path: "api/feedback/rewards-link",
            method: .POST,
            body: AnyEncodable(["name": name, "url": url])
        )
        _ = try await send(req)
    }
}
