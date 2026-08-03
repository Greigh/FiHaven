import Foundation

/// Subscription / entitlement / promo endpoints (docs/native-contract.md
/// §billing). The server is the source of truth; the client verifies a
/// store transaction or redeems a promo, then reads back the entitlement.
extension APIClient {
    /// Current Pro entitlement (`GET /api/billing/status`).
    public func billingStatus() async throws -> Entitlement {
        try await billingStatusFull().entitlement
    }

    /// Billing status including whether the web billing portal is available.
    public func billingStatusFull() async throws -> BillingStatusResponse {
        let req = try makeRequest(path: "api/billing/status", method: .GET)
        let data = try await send(req)
        return try decode(BillingStatusResponse.self, from: data)
    }

    /// Paddle-hosted customer portal (manage payment method, cancel, change
    /// plan) for a subscription bought on the web
    /// (`POST /api/billing/paddle/portal`). The dev server answers with a
    /// site-relative path, so resolve it against the API base.
    public func createBillingPortal() async throws -> URL {
        let req = try makeRequest(path: "api/billing/paddle/portal", method: .POST)
        let data = try await send(req)
        let urlString = try decode(PortalResponse.self, from: data).url
        let resolved = urlString.hasPrefix("/")
            ? URL(string: urlString, relativeTo: config.baseURL)
            : URL(string: urlString)
        guard let url = resolved else { throw APIError.decoding("invalid-portal-url") }
        return url
    }

    /// Verify a StoreKit 2 signed transaction and persist the subscription.
    ///
    /// `signedAppTransaction` is StoreKit's app-level `AppTransaction` JWS. It
    /// is what lets the server accept a sandbox purchase from the build under
    /// review without accepting sandbox purchases generally; omitting it just
    /// forfeits that, so callers that can't get one pass nil.
    public func verifyApple(
        signedTransaction: String,
        signedAppTransaction: String? = nil
    ) async throws -> Entitlement {
        let body = AppleVerifyBody(signedTransaction: signedTransaction,
                                   signedAppTransaction: signedAppTransaction)
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
}
