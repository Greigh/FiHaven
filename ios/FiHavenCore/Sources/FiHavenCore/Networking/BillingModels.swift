import Foundation

/// Effective Pro entitlement, derived server-side from store subscriptions
/// + promo grants (docs/native-contract.md §billing). `source` is
/// "apple" | "google" | "promo" | nil; `expiresAt` is epoch-ms
/// (nil = lifetime when pro, or none when not).
public struct Entitlement: Codable, Equatable, Sendable {
    public var pro: Bool
    public var source: String?
    public var productId: String?
    public var plan: String?
    public var expiresAt: Int64?
    public var autoRenew: Bool?
    /// Epoch-ms when the current Pro run began — a rough "Pro since" for the
    /// profile. nil when not Pro (or unknown from an older payload).
    public var proSince: Int64?

    public init(
        pro: Bool = false,
        source: String? = nil,
        productId: String? = nil,
        plan: String? = nil,
        expiresAt: Int64? = nil,
        autoRenew: Bool? = nil,
        proSince: Int64? = nil
    ) {
        self.pro = pro
        self.source = source
        self.productId = productId
        self.plan = plan
        self.expiresAt = expiresAt
        self.autoRenew = autoRenew
        self.proSince = proSince
    }
}

/// Native store offer returned when a `store_offer` promo is redeemed —
/// the client presents it through the App Store / Play to get the
/// discounted price.
public struct StoreOffer: Codable, Equatable, Sendable {
    public var platform: String?
    public var productId: String?
    public var offerId: String?
}

/// Result of redeeming a promo code.
public struct PromoResult: Codable, Equatable, Sendable {
    public var ok: Bool
    public var kind: String?          // "free_sub" | "store_offer"
    public var offer: StoreOffer?
    public var entitlement: Entitlement?
}

// ── Wire bodies ──────────────────────────────────────────────────
struct EntitlementResponse: Decodable { let entitlement: Entitlement }
struct AppleVerifyBody: Encodable { let signedTransaction: String }
struct GoogleVerifyBody: Encodable {
    let productId: String
    let purchaseToken: String
    let expiryTimeMillis: Int64?
}
struct PromoRedeemBody: Encodable { let code: String }
