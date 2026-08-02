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
    /// How many people a shared household may hold (0 = can't create one).
    /// Driven by the plan: Free 0, Pro 3, Family more. (Phase 4, pricing TBD.)
    public var householdMax: Int?

    public init(
        pro: Bool = false,
        source: String? = nil,
        productId: String? = nil,
        plan: String? = nil,
        expiresAt: Int64? = nil,
        autoRenew: Bool? = nil,
        proSince: Int64? = nil,
        householdMax: Int? = nil
    ) {
        self.pro = pro
        self.source = source
        self.productId = productId
        self.plan = plan
        self.expiresAt = expiresAt
        self.autoRenew = autoRenew
        self.proSince = proSince
        self.householdMax = householdMax
    }
}

// Server-issued promo codes (`POST /api/billing/promo/redeem`) are redeemable
// on the web and on Android only. iOS deliberately carries no promo-redemption
// model or client call: Guideline 3.1.1 allows just Apple's own offer-code
// sheet (`StoreManager.presentOfferCodeSheet`).

// ── Wire bodies ──────────────────────────────────────────────────
struct EntitlementResponse: Decodable { let entitlement: Entitlement }
public struct BillingStatusResponse: Decodable, Sendable {
    public let entitlement: Entitlement
    public let stripePortal: Bool?
}
struct StripePortalResponse: Decodable { let url: String }
struct AppleVerifyBody: Encodable { let signedTransaction: String }
struct GoogleVerifyBody: Encodable {
    let productId: String
    let purchaseToken: String
    let expiryTimeMillis: Int64?
}
