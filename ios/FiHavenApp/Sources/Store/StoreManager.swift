import Foundation
import StoreKit
import FiHavenCore
#if canImport(UIKit)
import UIKit
#endif

/// Owns StoreKit 2 (products, purchase, transaction listener) and the
/// app's effective Pro entitlement. The FiHaven server is the source of
/// truth: every verified transaction is sent to `/api/billing/apple/verify`
/// and we read the entitlement back. Promo codes redeem through the same
/// server. See docs/native-contract.md §billing.
@MainActor
final class StoreManager: ObservableObject {
    @Published private(set) var entitlement = Entitlement()
    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasing = false
    @Published private(set) var loadingProducts = false
    @Published var message: String?

    var isPro: Bool { entitlement.pro }

    /// Product ids — must match App Store Connect and the server's product
    /// map (server/billing.js DEFAULT_PRODUCTS).
    static let monthlyID = "app.fihaven.pro.monthly"
    static let yearlyID = "app.fihaven.pro.yearly"
    static let productIDs = [monthlyID, yearlyID]

    private let api: APIClient
    private var listener: Task<Void, Never>?

    init(api: APIClient) { self.api = api }

    /// Seed from the entitlement already in `/api/data` so gating doesn't
    /// flicker before the authoritative refresh lands.
    func seed(_ ent: Entitlement?) {
        if let ent, !entitlement.pro { entitlement = ent }
    }

    /// Begin listening for transaction updates (renewals, Ask-to-Buy,
    /// offer-code redemptions) and pull authoritative state + products.
    func start() async {
        if listener == nil {
            listener = Task { [weak self] in
                for await update in Transaction.updates {
                    await self?.handle(update)
                }
            }
        }
        await refresh()
        await loadProducts()
    }

    func reset() {
        listener?.cancel()
        listener = nil
        entitlement = Entitlement()
        products = []
        message = nil
    }

    func refresh() async {
        if let ent = try? await api.billingStatus() { entitlement = ent }
    }

    func loadProducts() async {
        loadingProducts = true
        defer { loadingProducts = false }
        do {
            let items = try await Product.products(for: Self.productIDs)
            products = items.sorted { $0.price < $1.price }
        } catch {
            // Leave products empty (e.g. no StoreKit config / network):
            // the paywall still offers the promo-code path.
        }
    }

    func purchase(_ product: Product) async {
        purchasing = true
        defer { purchasing = false }
        do {
            switch try await product.purchase() {
            case .success(let verification):
                await handle(verification)
            case .pending:
                message = "Purchase is pending approval."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            message = "Purchase failed. Please try again."
        }
    }

    /// "Restore" for subscriptions = re-sync with the server (which already
    /// knows the user's active subscriptions) plus re-check current entitlements.
    func restore() async {
        await refresh()
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let txn) = result else { return }
        // Hand the signed JWS to our server for authoritative verification.
        if let ent = try? await api.verifyApple(signedTransaction: result.jwsRepresentation) {
            entitlement = ent
        }
        await txn.finish()
    }

    /// Redeem a server promo code. `free_sub` grants entitlement directly;
    /// `store_offer` returns a native offer the caller can present.
    @discardableResult
    func redeemPromo(_ code: String) async -> PromoResult? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        do {
            let result = try await api.redeemPromo(code: trimmed)
            if let ent = result.entitlement { entitlement = ent }
            return result
        } catch {
            message = Self.promoError(error)
            return nil
        }
    }

    /// Present Apple's offer-code redemption sheet (App Store promo / offer
    /// codes — the native discounted-purchase path).
    func presentOfferCodeSheet() {
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return }
        Task { try? await StoreKit.AppStore.presentOfferCodeRedeemSheet(in: scene) }
        #endif
    }

    private static func promoError(_ error: Error) -> String {
        if case APIError.http(_, let code) = error {
            switch code {
            case "already-redeemed": return "You’ve already used that code."
            case "code-exhausted": return "That code has reached its limit."
            case "code-expired": return "That code has expired."
            case "invalid-code": return "That code isn’t valid."
            default: break
            }
        }
        return "Couldn’t redeem that code."
    }
}
