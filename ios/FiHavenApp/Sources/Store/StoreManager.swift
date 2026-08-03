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
    /// Whether the server can open a web (Paddle) billing portal for this user.
    @Published private(set) var billingPortal = false
    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasing = false
    @Published private(set) var loadingProducts = false
    @Published var message: String?
    /// Ids this Apple ID can still start an introductory offer on. Pro monthly
    /// and yearly carry a 7-day free trial in App Store Connect (Family never
    /// has); Guideline 3.1.2 requires the paywall to spell that out — but only
    /// to someone who would actually receive it, so a returning subscriber
    /// sees the plain price instead of a trial that won't apply to them.
    @Published private(set) var introEligible: Set<String> = []

    var isPro: Bool { entitlement.pro }

    /// Product ids — must match App Store Connect and the server's product
    /// map (server/billing.js DEFAULT_PRODUCTS).
    ///
    /// `Product.products(for:)` returns only the ids that exist in App Store
    /// Connect, so listing `familyID` before that product is approved simply
    /// means it doesn't appear — no error, no crash.
    ///
    /// Note the Play id for Family is `app.fihaven.pro.family.yearly` — the two
    /// stores disagree and the server maps both. See BillingManager.FAMILY.
    ///
    /// Subscription-group **levels** matter here and live only in App Store
    /// Connect: Family must rank above the Pro plans (level 1 vs 2) or StoreKit
    /// defers "Upgrade to Family" to the end of the paid period instead of
    /// switching immediately. FiHaven.storekit mirrors that ranking for local
    /// testing.
    static let monthlyID = "app.fihaven.pro.monthly"
    static let yearlyID = "app.fihaven.pro.yearly"
    static let familyID = "app.fihaven.pro.family"
    static let productIDs = [monthlyID, yearlyID, familyID]

    private let api: APIClient
    private var listener: Task<Void, Never>?
    /// Fetched once per launch — see signedAppTransaction().
    private var cachedAppTransaction: String?

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
        // A subscription the server doesn't know about (verification failed at
        // purchase time, or the transaction was finished before it landed)
        // would otherwise stay invisible until the user found "Restore".
        if !entitlement.pro { await replayEntitlements() }
        await loadProducts()
    }

    func reset() {
        listener?.cancel()
        listener = nil
        entitlement = Entitlement()
        billingPortal = false
        products = []
        message = nil
    }

    func refresh() async {
        #if DEBUG
        if let synth = Self.devEntitlement(devEntitlementOverride) { entitlement = synth; return }
        #endif
        if let status = try? await api.billingStatusFull() {
            entitlement = status.entitlement
            billingPortal = status.paddlePortal ?? false
        }
    }

    /// Where this subscription is actually managed. Every paying source needs a
    /// line here or a button below it: a subscriber who bought elsewhere used to
    /// land on "You're on FiHaven Pro" with no button and no hint about where
    /// to go to cancel.
    var billingNote: String? {
        guard isPro else { return nil }
        switch entitlement.source {
        case "comp": return "You have complimentary Pro access — no subscription to manage."
        case "promo": return "Your Pro access is from a promo code — no subscription to manage."
        case "google":
            return "You subscribed on an Android device. Manage or cancel it there, in Google Play → Subscriptions."
        // A web subscription normally offers the portal button instead; this
        // covers the case where the server can't open one.
        case "paddle" where !billingPortal:
            return "You subscribed on fihaven.app. Manage or cancel it by signing in there."
        default: return nil
        }
    }

    var manageButtonLabel: String? {
        guard isPro else { return nil }
        if billingPortal { return "Manage subscription" }
        if entitlement.source == "apple" { return "Manage in App Store" }
        return nil
    }

    /// The store terms under the plan list. Apple's wording is only true for a
    /// purchase made through Apple — it was shown unconditionally, so an
    /// Android or web subscriber was told their money goes to their Apple ID
    /// and to cancel somewhere they have no subscription.
    var storeTerms: String? {
        if !isPro || entitlement.source == "apple" {
            return "Subscriptions are auto-renewing. Payment is charged to your Apple ID. "
                + "Renews unless canceled at least 24 hours before the period ends. "
                + "Manage or cancel in Settings → Apple ID → Subscriptions."
        }
        if entitlement.source == "comp" || entitlement.source == "promo" { return nil }
        return "Subscriptions are auto-renewing and renew unless canceled before the period ends. "
            + "This one wasn’t bought through the App Store, so it’s managed where you bought it."
    }

    func manageSubscription() async {
        if billingPortal {
            await openBillingPortal()
        } else if entitlement.source == "apple" {
            showManageSubscriptions()
        }
    }

    func openBillingPortal() async {
        do {
            let url = try await api.createBillingPortal()
            #if canImport(UIKit)
            await UIApplication.shared.open(url)
            #endif
        } catch {
            message = Self.portalError(error)
        }
    }

    func showManageSubscriptions() {
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return }
        Task { try? await StoreKit.AppStore.showManageSubscriptions(in: scene) }
        #endif
    }

    private static func portalError(_ error: Error) -> String {
        if case APIError.http(_, let code) = error {
            switch code {
            case "not-paddle-subscriber":
                return "No web subscription is linked to this account."
            case "portal-customer-missing":
                return "We couldn’t find your billing profile. Manage it by signing in at fihaven.app."
            default: break
            }
        }
        return "The billing portal couldn’t be opened. Manage it by signing in at fihaven.app."
    }

    #if DEBUG
    // ── Dev-only entitlement override (testing) ──────────────────
    // Simulates each Pro state without a real purchase. Local to the
    // device; never touches the server. Gated to DEBUG builds.
    private static let devKey = "fh_dev_entitlement"
    var devEntitlementOverride: String {
        get { UserDefaults.standard.string(forKey: Self.devKey) ?? "off" }
        set {
            if newValue == "off" { UserDefaults.standard.removeObject(forKey: Self.devKey) }
            else { UserDefaults.standard.set(newValue, forKey: Self.devKey) }
            if let synth = Self.devEntitlement(newValue) { entitlement = synth }
            else { Task { await refresh() } }
        }
    }
    static func devEntitlement(_ state: String) -> Entitlement? {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let day: Int64 = 86_400_000
        switch state {
        case "free":     return Entitlement(pro: false, source: "dev")
        case "active":   return Entitlement(pro: true, source: "dev", plan: "monthly", expiresAt: now + 30 * day, autoRenew: true, proSince: now - 90 * day)
        case "expired":  return Entitlement(pro: false, source: "dev", plan: "monthly", expiresAt: now - 2 * day, autoRenew: false)
        case "grace":    return Entitlement(pro: true, source: "dev", plan: "monthly", expiresAt: now - 1 * day, autoRenew: false, proSince: now - 120 * day)
        case "canceled": return Entitlement(pro: true, source: "dev", plan: "monthly", expiresAt: now + 10 * day, autoRenew: false, proSince: now - 200 * day)
        default:         return nil
        }
    }
    #endif

    func loadProducts() async {
        loadingProducts = true
        defer { loadingProducts = false }
        do {
            let items = try await Product.products(for: Self.productIDs)
            products = items.sorted { $0.price < $1.price }
            introEligible = await Self.introEligibleIDs(items)
            #if DEBUG
            if items.isEmpty {
                print("[StoreManager] Product.products returned [] for \(Self.productIDs). Check ASC metadata, Paid Apps Agreement, and that IAPs are attached to this version.")
            } else {
                print("[StoreManager] loaded products: \(items.map(\.id))")
            }
            #endif
        } catch {
            // Leave products empty (e.g. no StoreKit config / network):
            // the paywall still offers the promo-code path.
            #if DEBUG
            print("[StoreManager] Product.products failed: \(error)")
            #endif
        }
    }

    /// Which of `items` still qualify for their introductory offer. Asked per
    /// product because eligibility is a property of the Apple ID's history in
    /// the subscription group, not of the product.
    private static func introEligibleIDs(_ items: [Product]) async -> Set<String> {
        var eligible: Set<String> = []
        for product in items {
            guard let sub = product.subscription, sub.introductoryOffer != nil else { continue }
            if await sub.isEligibleForIntroOffer { eligible.insert(product.id) }
        }
        return eligible
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

    /// "Restore" for subscriptions. Asking our own server first is not enough:
    /// it only knows about subscriptions it has already been told about, so a
    /// reinstall, a new FiHaven account, or a purchase whose original
    /// verification call failed would all restore to nothing — the user has
    /// paid Apple and stays locked out. Re-present the Apple ID's own
    /// entitlements to the server, then read the result back.
    func restore() async {
        purchasing = true
        defer { purchasing = false }
        // Pull anything the device hasn't seen yet (may prompt for the Apple ID).
        try? await StoreKit.AppStore.sync()
        await replayEntitlements()
        await refresh()
        if !entitlement.pro {
            message = "No active subscription was found for this Apple ID."
        }
    }

    /// Re-send every current StoreKit entitlement to the server. Safe to run
    /// repeatedly — verification is idempotent server-side.
    private func replayEntitlements() async {
        #if DEBUG
        // A simulated state is the whole point of the override; don't let a
        // real StoreKit entitlement overwrite it.
        if Self.devEntitlement(devEntitlementOverride) != nil { return }
        #endif
        let appTxn = await signedAppTransaction()
        for await result in Transaction.currentEntitlements {
            guard case .verified = result else { continue }
            if let ent = try? await api.verifyApple(signedTransaction: result.jwsRepresentation,
                                                    signedAppTransaction: appTxn) {
                entitlement = ent
            }
        }
    }

    /// StoreKit's signed `AppTransaction`, or nil if it can't be produced.
    ///
    /// This names the build the purchase came from, which is what lets the
    /// server accept sandbox purchases from the build in App Review without
    /// accepting them from every sandbox tester forever. It never changes for
    /// an installed build, so fetch it once — the first call can hit the
    /// network, and a purchase is the worst moment to wait on that.
    ///
    /// Failure is not an error worth surfacing: the user still gets their
    /// purchase, it just falls back to the server's dated review window.
    private func signedAppTransaction() async -> String? {
        if let cachedAppTransaction { return cachedAppTransaction }
        guard let result = try? await AppTransaction.shared,
              case .verified = result
        else { return nil }
        cachedAppTransaction = result.jwsRepresentation
        return cachedAppTransaction
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let txn) = result else { return }
        // Hand the signed JWS to our server for authoritative verification.
        // Only finish once the server has actually recorded it: finishing a
        // transaction drops it from `Transaction.updates`, so finishing after
        // a failed verify (offline, 500, expired session) loses the purchase
        // until something else replays it. Left unfinished, StoreKit
        // re-delivers it on the next launch.
        guard let ent = try? await api.verifyApple(
            signedTransaction: result.jwsRepresentation,
            signedAppTransaction: await signedAppTransaction()
        ) else {
            return
        }
        entitlement = ent
        await txn.finish()
    }

    /// Present Apple's offer-code redemption sheet (App Store promo / offer
    /// codes — the native discounted-purchase path, and the only redemption
    /// path this app offers: Guideline 3.1.1 forbids taking a code in-app).
    func presentOfferCodeSheet() {
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return }
        Task { try? await StoreKit.AppStore.presentOfferCodeRedeemSheet(in: scene) }
        #endif
    }
}
