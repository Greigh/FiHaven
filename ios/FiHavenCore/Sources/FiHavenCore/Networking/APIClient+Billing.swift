import Foundation

/// Subscription / entitlement / promo endpoints (docs/native-contract.md
/// §billing). The server is the source of truth; the client verifies a
/// store transaction or redeems a promo, then reads back the entitlement.
extension APIClient {
    /// Current Pro entitlement (`GET /api/billing/status`).
    public func billingStatus() async throws -> Entitlement {
        try await billingStatusFull().entitlement
    }

    /// Billing status including whether the Stripe portal is available.
    public func billingStatusFull() async throws -> BillingStatusResponse {
        let req = try makeRequest(path: "api/billing/status", method: .GET)
        let data = try await send(req)
        return try decode(BillingStatusResponse.self, from: data)
    }

    /// Open the Stripe billing portal (`POST /api/billing/stripe/portal`).
    public func createStripePortal() async throws -> URL {
        let req = try makeRequest(path: "api/billing/stripe/portal", method: .POST)
        let data = try await send(req)
        let urlString = try decode(StripePortalResponse.self, from: data).url
        guard let url = URL(string: urlString) else { throw APIError.decoding("invalid-portal-url") }
        return url
    }

    /// Verify a StoreKit 2 signed transaction and persist the subscription.
    public func verifyApple(signedTransaction: String) async throws -> Entitlement {
        let body = AppleVerifyBody(signedTransaction: signedTransaction)
        let req = try makeRequest(path: "api/billing/apple/verify", method: .POST,
                                  body: AnyEncodable(body))
        let data = try await send(req)
        return try decode(EntitlementResponse.self, from: data).entitlement
    }

    /// Verify a Google Play purchase token and persist the subscription.
    public func verifyGoogle(
        productId: String,
        purchaseToken: String,
        expiryTimeMillis: Int64? = nil
    ) async throws -> Entitlement {
        let body = GoogleVerifyBody(productId: productId, purchaseToken: purchaseToken,
                                    expiryTimeMillis: expiryTimeMillis)
        let req = try makeRequest(path: "api/billing/google/verify", method: .POST,
                                  body: AnyEncodable(body))
        let data = try await send(req)
        return try decode(EntitlementResponse.self, from: data).entitlement
    }

    /// Redeem a server-issued promo code. A `free_sub` grants entitlement
    /// directly; a `store_offer` returns the native offer to redeem in the
    /// store. Throws `APIError.http(409, …)` for invalid/exhausted/already.
    public func redeemPromo(code: String) async throws -> PromoResult {
        let body = PromoRedeemBody(code: code)
        let req = try makeRequest(path: "api/billing/promo/redeem", method: .POST,
                                  body: AnyEncodable(body))
        let data = try await send(req)
        return try decode(PromoResult.self, from: data)
    }
}
