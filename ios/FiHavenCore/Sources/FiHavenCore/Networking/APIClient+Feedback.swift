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

    /// Report a reward rate we ship that's wrong (e.g. we claim 3% on Gas when
    /// the card really earns 1%). Mailed, never stored — same contract as the
    /// link routes. `ourRate` is empty when we have no rate for the category.
    func reportRewardRate(
        card: String,
        issuer: String,
        category: String,
        ourRate: Double?,
        correctRate: Double,
        note: String
    ) async throws {
        let req = try makeRequest(
            path: "api/feedback/reward-rate",
            method: .POST,
            body: AnyEncodable([
                "card": card,
                "issuer": issuer,
                "category": category,
                "ourRate": ourRate.map { String($0) } ?? "",
                "correctRate": String(correctRate),
                "note": note,
            ])
        )
        _ = try await send(req)
    }
}
