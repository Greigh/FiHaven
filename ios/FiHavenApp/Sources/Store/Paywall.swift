import SwiftUI
import StoreKit
import FiHavenCore

/// A feature gated behind FiHaven Pro.
enum ProFeature {
    case payoff, calendar, history, rewards, subscriptions

    var title: String {
        switch self {
        case .payoff: return "Payoff Planner"
        case .calendar: return "Calendar"
        case .history: return "Payment History"
        case .rewards: return "Rewards Optimizer"
        case .subscriptions: return "Subscription Finder"
        }
    }
    var icon: String {
        switch self {
        case .payoff: return "chart.line.downtrend.xyaxis"
        case .calendar: return "calendar"
        case .history: return "clock.arrow.circlepath"
        case .rewards: return "star.circle.fill"
        case .subscriptions: return "arrow.triangle.2.circlepath"
        }
    }
    var blurb: String {
        switch self {
        case .payoff: return "See snowball & avalanche plans and your debt-free date."
        case .calendar: return "View every due date on a monthly calendar."
        case .history: return "Browse and search your full payment history."
        case .rewards: return "See which card to use for every purchase to earn the most."
        case .subscriptions: return "Find recurring charges, price hikes, and unused subscriptions."
        }
    }
}

/// Shows `content` when the user is Pro, otherwise a locked screen that
/// opens the paywall.
struct ProGate<Content: View>: View {
    @EnvironmentObject var billing: StoreManager
    let feature: ProFeature
    @ViewBuilder var content: () -> Content

    var body: some View {
        if billing.isPro {
            content()
        } else {
            ProLockedView(feature: feature)
        }
    }
}

/// Plan pill — "PRO" or "FAMILY". Two tiers gate different things: Pro unlocks
/// the planning tools, and only the Family plan can create a household.
struct PlanBadge: View {
    let text: String
    let accessibility: String

    var body: some View {
        Text(text)
            .font(Theme.mono(11, weight: .bold)).tracking(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Theme.accentBg)
            .foregroundStyle(Theme.accent)
            .clipShape(Capsule())
            .accessibilityLabel(accessibility)
    }
}

/// "PRO" pill.
struct ProBadge: View {
    var body: some View { PlanBadge(text: "PRO", accessibility: "Pro feature") }
}

/// "FAMILY" pill — for the one thing solo Pro does not unlock.
struct FamilyBadge: View {
    var body: some View { PlanBadge(text: "FAMILY", accessibility: "Family plan feature") }
}

/// "Save 37%" pill. Green rather than accent-coloured: it sits on a plan row
/// that turns accent-tinted when selected, where another accent pill would
/// vanish — and it reads as a saving, not as a tier like PRO / FAMILY.
/// Hidden from VoiceOver because `planAccessibilityLabel` already speaks it.
struct SavingsBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.mono(11, weight: .bold))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Theme.green.opacity(0.16))
            .foregroundStyle(Theme.green)
            .clipShape(Capsule())
            .accessibilityHidden(true)
    }
}

/// Shown in place of a Pro feature when the user is on the free tier.
struct ProLockedView: View {
    @EnvironmentObject var billing: StoreManager
    let feature: ProFeature
    @State private var showPaywall = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: feature.icon)
                .font(.system(size: 44))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            ProBadge()
            Text(feature.title).font(Theme.title(24)).foregroundStyle(Theme.text)
            Text(feature.blurb)
                .font(Theme.ui(15)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button("Unlock FiHaven Pro") { showPaywall = true }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, 24)
                .padding(.top, 4)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle(feature.title)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityElement(children: .contain)
        .sheet(isPresented: $showPaywall) { PaywallView() }
    }
}

/// The subscription paywall: perks, plan options, App Store offer-code
/// redemption, and restore.
///
/// Guideline 3.1.1: on iOS the only code-redemption path is Apple's own
/// offer-code sheet. Server-issued FiHaven promo codes are redeemable on the
/// web and on Android only — this app must never take a code by hand.
struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView { PaywallContent() }
                .background(Theme.bg.ignoresSafeArea())
                .navigationTitle("FiHaven Pro")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                }
        }
    }
}

/// The paywall itself, with no presentation chrome of its own — so the same
/// perks, plans, and legal footer can be a sheet over a locked feature *or*
/// the body of the Pro screen, where putting them behind an "Upgrade" button
/// only added a tap.
struct PaywallContent: View {
    @EnvironmentObject var billing: StoreManager

    /// The plan the CTA will buy. Nil means "nothing tapped yet", which resolves
    /// to `defaultProduct` (yearly) — so the preselection survives products
    /// arriving late from StoreKit without an onChange to re-seed it.
    @State private var selectedID: String?
    @State private var showAllPerks = false

    /// The three perks that carry the pitch. Nine bullets above the price meant
    /// a wall to scroll past before learning what Pro costs, so the rest moved
    /// behind `morePerks`.
    ///
    /// Family sharing is deliberately absent from both lists: creating a
    /// household needs the separate Family subscription (billing.js:
    /// HOUSEHOLD_MAX_PRO is 0), so it gets its own card below.
    private let topPerks: [(String, String, String)] = [
        ("chart.line.downtrend.xyaxis", "Payoff planner", "Snowball & avalanche plans + your debt-free date"),
        ("star.circle.fill", "Rewards optimizer", "See which card earns the most for each purchase"),
        ("arrow.triangle.2.circlepath", "Subscription finder", "Spot recurring charges and price hikes"),
    ]

    /// Revealed by "See everything in Pro".
    private let morePerks: [(String, String, String)] = [
        ("calendar", "Due-date calendar", "Every bill and card on a monthly view"),
        ("clock.arrow.circlepath", "Payment history", "Search and review everything you've paid"),
        ("chart.pie.fill", "Category budgets", "Set spending limits and track progress by category"),
        ("building.columns.fill", "Bank linking", "Auto-fetch balances via Plaid (optional)"),
        ("checkmark.seal.fill", "Autopay mark", "Auto-mark autopay items paid on their due date"),
        ("square.and.arrow.up", "Data export", "Download your full account any time"),
    ]

    var body: some View {
        VStack(spacing: 22) {
            header
            perksCard
            if billing.isPro {
                activeCard
                // A solo-Pro subscriber previously had no way to reach
                // Family from anywhere in the app.
                if !onFamily, let family = familyProduct {
                    familyOption(family, isUpgrade: true)
                }
            } else {
                plansSection
                if let family = familyProduct {
                    familyOption(family, isUpgrade: false)
                }
            }
            if billing.isPro, let note = billing.billingNote {
                Text(note)
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            if let manageLabel = billing.manageButtonLabel {
                Button(manageLabel) { Task { await billing.manageSubscription() } }
                    .buttonStyle(PlanButtonStyle())
            }
            footer
        }
        .padding(20)
        .alert("Notice", isPresented: messageBinding) {
            Button("OK") { billing.message = nil }
        } message: {
            Text(billing.message ?? "")
        }
        // Re-fetch whenever this appears — launch-time StoreKit can return
        // [] (agreement / metadata / network), and we never retried before.
        .task { await billing.loadProducts() }
    }

    private var messageBinding: Binding<Bool> {
        Binding(get: { billing.message != nil },
                set: { if !$0 { billing.message = nil } })
    }

    private var header: some View {
        VStack(spacing: 10) {
            Wordmark(size: 30)
            ProBadge()
            // The promise, at title weight. This used to be muted 15pt body
            // copy, which read as a caption under the wordmark rather than as
            // the reason to keep scrolling.
            Text("Turn your bills into a payoff plan.")
                .font(Theme.title(24)).foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text("Every planning tool FiHaven has, on web, iOS and Android.")
                .font(Theme.ui(15)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var perksCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(topPerks, id: \.1) { perk in perkRow(perk) }
            if showAllPerks {
                ForEach(morePerks, id: \.1) { perk in perkRow(perk) }
            }
            Button {
                withAnimation(.easeInOut(duration: 0.18)) { showAllPerks.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Text(showAllPerks ? "Show less" : "See everything in Pro")
                    Image(systemName: showAllPerks ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                }
                .font(Theme.ui(14, weight: .semibold))
                .foregroundStyle(Theme.accent)
            }
            .accessibilityHint(showAllPerks ? "Collapses the full feature list" : "Expands the full feature list")
        }
        .ctCard()
    }

    private func perkRow(_ perk: (String, String, String)) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: perk.0)
                .foregroundStyle(Theme.accent)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(perk.1).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                Text(perk.2).font(Theme.ui(13)).foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(perk.1). \(perk.2)")
    }

    /// Family is a separate subscription, not a Pro tier — it gets its own card.
    private var familyProduct: Product? {
        billing.products.first { $0.id == StoreManager.familyID }
    }
    /// Longest interval first, so the best-value plan leads the list.
    private var proProducts: [Product] {
        billing.products
            .filter { $0.id != StoreManager.familyID }
            .sorted { intervalRank($0) > intervalRank($1) }
    }
    private var onFamily: Bool { billing.entitlement.plan == "family" }

    /// Yearly outranks monthly outranks weekly; unknown periods sort last.
    private func intervalRank(_ p: Product) -> Int {
        switch p.subscription?.subscriptionPeriod.unit {
        case .year: return 3
        case .month: return 2
        case .week: return 1
        default: return 0
        }
    }

    private func isYearly(_ p: Product) -> Bool {
        guard let period = p.subscription?.subscriptionPeriod else { return false }
        return period.unit == .year && period.value == 1
    }

    /// Yearly is preselected — it's the plan most people want and the one the
    /// savings badge is about. Falls back to the first plan on a storefront
    /// that carries no yearly SKU.
    private var defaultProduct: Product? {
        proProducts.first(where: isYearly) ?? proProducts.first
    }

    /// What the CTA will buy. `selectedID` wins once the user taps a row.
    private var selectedProduct: Product? {
        if let id = selectedID, let match = proProducts.first(where: { $0.id == id }) { return match }
        return defaultProduct
    }

    private var plansSection: some View {
        VStack(spacing: 12) {
            if billing.loadingProducts {
                ProgressView().padding()
            } else if billing.products.isEmpty {
                VStack(spacing: 10) {
                    Text("Subscriptions aren’t available right now. Please check your connection and try again.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                    Button("Try again") { Task { await billing.loadProducts() } }
                        .font(Theme.ui(14, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
            } else {
                ForEach(proProducts, id: \.id) { product in planRow(product) }
                purchaseCTA
                if billing.purchasing {
                    ProgressView()
                        .accessibilityLabel("Processing purchase")
                }
            }
        }
    }

    /// A plan row now *selects* rather than buying. Tapping a row used to open
    /// the App Store purchase sheet immediately, which made a mis-tap a
    /// purchase attempt and left no way to compare the plans first.
    private func planRow(_ product: Product) -> some View {
        let selected = selectedProduct?.id == product.id
        return Button {
            selectedID = product.id
        } label: {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? Theme.accent : Theme.muted)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        // Apple 3.1.2: title, length, and price of each
                        // auto-renewing subscription must be visible — on every
                        // row, not only the selected one.
                        Text(product.displayName)
                            .font(Theme.ui(16, weight: .semibold))
                            .foregroundStyle(Theme.text)
                        if let save = savingsLabel(product) { SavingsBadge(text: save) }
                    }
                    Text(lengthLabel(product))
                        .font(Theme.ui(12))
                        .foregroundStyle(Theme.muted)
                    if let perUnit = pricePerUnitLabel(product) {
                        Text(perUnit)
                            .font(Theme.ui(12))
                            .foregroundStyle(Theme.muted)
                    }
                    // 3.1.2: an introductory offer must state what it is, how
                    // long it runs, and what it becomes.
                    if let intro = introLabel(product) {
                        Text(intro)
                            .font(Theme.ui(12, weight: .semibold))
                            .foregroundStyle(Theme.green)
                    }
                }
                Spacer(minLength: 8)
                Text(product.displayPrice)
                    .font(Theme.mono(16, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(selected ? Theme.accentBg : Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                    .stroke(selected ? Theme.accent : Theme.accent.opacity(0.25),
                            lineWidth: selected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(billing.purchasing)
        .accessibilityLabel(planAccessibilityLabel(product))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint("Selects this plan")
    }

    /// The one primary button, plus the exact terms of whatever is selected.
    ///
    /// The button never names a price the purchase won't actually charge: when
    /// a free trial applies it says so and `selectedTerms` immediately below
    /// spells out what it renews into (3.1.2), rather than putting an
    /// introductory figure on the button and the real one out of sight.
    private var purchaseCTA: some View {
        VStack(spacing: 8) {
            Button(ctaLabel) {
                guard let product = selectedProduct else { return }
                Task { await billing.purchase(product) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(billing.purchasing || selectedProduct == nil)
            .accessibilityHint("Starts purchase")

            if let terms = selectedTerms {
                Text(terms)
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            Text("Cancel anytime · Your data is never sold")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 4)
    }

    private var ctaLabel: String {
        guard let product = selectedProduct else { return "Continue" }
        if billing.introEligible.contains(product.id),
           let offer = product.subscription?.introductoryOffer,
           offer.paymentMode == .freeTrial {
            return "Start \(offerLength(offer)) free"
        }
        return "Subscribe"
    }

    /// Full terms for the selected plan, restated under the button so the price
    /// being agreed to is next to the tap that agrees to it.
    private var selectedTerms: String? {
        guard let product = selectedProduct else { return nil }
        if let intro = introLabel(product) { return "\(intro). Cancel before it renews." }
        return "\(product.displayPrice)/\(billingNoun(product)), auto-renewing."
    }

    /// "Save 37%" on the yearly row, measured against twelve months of the
    /// monthly plan. Nil unless both plans are on this storefront and the
    /// saving is real and worth stating — the badge should never be a claim we
    /// can't back out of the two prices shown on screen.
    private func savingsLabel(_ product: Product) -> String? {
        guard isYearly(product),
              let monthly = proProducts.first(where: {
                  $0.subscription?.subscriptionPeriod.unit == .month
                      && $0.subscription?.subscriptionPeriod.value == 1
              }) else { return nil }
        let yearOfMonthly = monthly.price * 12
        guard yearOfMonthly > 0, product.price < yearOfMonthly else { return nil }
        let fraction = (yearOfMonthly - product.price) / yearOfMonthly
        let percent = Int((NSDecimalNumber(decimal: fraction).doubleValue * 100).rounded())
        guard percent >= 5 else { return nil }
        return "Save \(percent)%"
    }

    /// The Family subscription (`app.fihaven.pro.family`) — the only plan the
    /// server grants a shared household to (billing.js `householdMaxFor`).
    /// `isUpgrade` is true when the user already holds solo Pro; StoreKit treats
    /// the purchase as a crossgrade within the subscription group.
    private func familyOption(_ product: Product, isUpgrade: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    FamilyBadge()
                    Text(product.displayName)
                        .font(Theme.ui(16, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    Text(lengthLabel(product))
                        .font(Theme.ui(12))
                        .foregroundStyle(Theme.muted)
                    // Family carries no trial today, but say so if that changes.
                    if let intro = introLabel(product) {
                        Text(intro)
                            .font(Theme.ui(12, weight: .semibold))
                            .foregroundStyle(Theme.green)
                    }
                }
                Spacer(minLength: 12)
                Text(product.displayPrice)
                    .font(Theme.mono(16, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            Text("Everything in Pro, plus a shared household — share bills, cards & goals with up to 3 people. Joining a household is always free.")
                .font(Theme.ui(13)).foregroundStyle(Theme.muted)
            Button(isUpgrade ? "Upgrade to Family" : "Get the Family plan") {
                Task { await billing.purchase(product) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(billing.purchasing)
        }
        .ctCard()
        .accessibilityElement(children: .contain)
        .accessibilityLabel(planAccessibilityLabel(product))
    }

    private var activeCard: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title2)
                    .foregroundStyle(Theme.green)
                Text("Active")
                    .font(Theme.ui(13, weight: .semibold))
                    .foregroundStyle(Theme.green)
            }
            Text("You’re on FiHaven Pro").font(Theme.ui(17, weight: .semibold)).foregroundStyle(Theme.text)
            if let source = sourceLabel {
                Text("Provider: \(source)")
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.muted)
            }
            if let line = renewalLine {
                Text(line).font(Theme.ui(13)).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .ctCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("FiHaven Pro is active. \(renewalLine ?? "")")
    }

    private var sourceLabel: String? {
        guard let s = billing.entitlement.source else { return nil }
        switch s {
        case "paddle": return "FiHaven.app"
        case "stripe": return "Stripe"
        case "apple": return "App Store"
        case "google": return "Play Store"
        case "promo": return "Promo Code"
        case "comp": return "Complimentary"
        default: return s.capitalized
        }
    }

    /// One tight block: the 22pt that separates the cards above read as dead
    /// space between four lines of fine print.
    private var footer: some View {
        VStack(spacing: 6) {
            // Opens Apple's own redemption sheet (StoreKit). No in-app code
            // entry — Guideline 3.1.1.
            Button("Redeem an App Store code") { billing.presentOfferCodeSheet() }
                .font(Theme.ui(15, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .accessibilityHint("Opens the App Store code redemption sheet")
            Button("Restore purchases") { Task { await billing.restore() } }
                .font(Theme.ui(14))
                .foregroundStyle(Theme.muted)
            if let terms = billing.storeTerms {
                Text(terms)
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            // Required functional links for Guideline 3.1.2 (also in Settings → About).
            HStack(spacing: 6) {
                Link("Privacy Policy", destination: URL(string: "https://fihaven.app/privacy")!)
                Text("·").foregroundStyle(Theme.muted)
                Link("Terms of Use (EULA)", destination: URL(string: "https://fihaven.app/terms")!)
            }
            .font(Theme.ui(12))
            .foregroundStyle(Theme.accent)
        }
    }

    private var renewalLine: String? {
        let e = billing.entitlement
        guard let ms = e.expiresAt else { return e.source == "promo" ? "Granted by promo code." : nil }
        let date = Date(timeIntervalSince1970: Double(ms) / 1000)
        let f = DateFormatter(); f.dateStyle = .medium
        let verb = (e.autoRenew == true) ? "Renews" : "Expires"
        return "\(verb) \(f.string(from: date))"
    }

    /// Human-readable subscription length for App Review / 3.1.2.
    private func lengthLabel(_ p: Product) -> String {
        guard let period = p.subscription?.subscriptionPeriod else {
            return "Auto-renewing subscription"
        }
        let unit: String
        switch period.unit {
        case .day: unit = period.value == 1 ? "day" : "\(period.value) days"
        case .week: unit = period.value == 1 ? "week" : "\(period.value) weeks"
        case .month: unit = period.value == 1 ? "month" : "\(period.value) months"
        case .year: unit = period.value == 1 ? "year" : "\(period.value) years"
        @unknown default: unit = "period"
        }
        if period.value == 1 {
            return "Length: 1 \(unit) · auto-renewing"
        }
        return "Length: \(unit) · auto-renewing"
    }

    /// "7 days", "1 month", "3 months" — the whole length of an intro offer.
    private func offerLength(_ offer: Product.SubscriptionOffer) -> String {
        var value = offer.period.value * offer.periodCount
        var unit = offer.period.unit
        // App Store Connect models the 7-day trial as one week; say it the way
        // the store listing and the marketing site do.
        if unit == .week {
            value *= 7
            unit = .day
        }
        let noun: String
        switch unit {
        case .day: noun = "day"
        case .week: noun = "week"
        case .month: noun = "month"
        case .year: noun = "year"
        @unknown default: noun = "period"
        }
        return "\(value) \(noun)\(value == 1 ? "" : "s")"
    }

    /// "month" / "year" — what the recurring price is charged per.
    private func billingNoun(_ p: Product) -> String {
        guard let period = p.subscription?.subscriptionPeriod else { return "period" }
        switch period.unit {
        case .day: return period.value == 1 ? "day" : "\(period.value) days"
        case .week: return period.value == 1 ? "week" : "\(period.value) weeks"
        case .month: return period.value == 1 ? "month" : "\(period.value) months"
        case .year: return period.value == 1 ? "year" : "\(period.value) years"
        @unknown default: return "period"
        }
    }

    /// The introductory offer in plain words — required by Guideline 3.1.2 and
    /// promised by the marketing site ("7-day free trial"), which the paywall
    /// never used to mention. Nil when this Apple ID isn't eligible, so a
    /// returning subscriber is never shown a trial they won't get.
    private func introLabel(_ p: Product) -> String? {
        guard billing.introEligible.contains(p.id),
              let offer = p.subscription?.introductoryOffer else { return nil }
        let then = "then \(p.displayPrice)/\(billingNoun(p))"
        switch offer.paymentMode {
        case .freeTrial:
            return "\(offerLength(offer)) free, \(then)"
        case .payAsYouGo:
            return "\(offer.displayPrice)/\(billingNoun(p)) for \(offerLength(offer)), \(then)"
        case .payUpFront:
            return "\(offer.displayPrice) for \(offerLength(offer)), \(then)"
        default:
            return nil
        }
    }

    /// Optional price-per-unit line (e.g. yearly → approx. monthly).
    ///
    /// Formatted with the product's own `priceFormatStyle`, which carries the
    /// storefront's currency. A `NumberFormatter` keyed to `Locale.current`
    /// takes the currency from the *device region* instead, so someone on the
    /// US storefront with their region set to Japan saw a dollar price
    /// relabelled with a yen sign.
    private func pricePerUnitLabel(_ p: Product) -> String? {
        guard let period = p.subscription?.subscriptionPeriod,
              period.unit == .year, period.value == 1 else { return nil }
        let monthly = p.price / 12
        return "\(monthly.formatted(p.priceFormatStyle))/mo billed annually"
    }

    private func planAccessibilityLabel(_ product: Product) -> String {
        [product.displayName, savingsLabel(product), product.displayPrice,
         lengthLabel(product), pricePerUnitLabel(product), introLabel(product)]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

/// Bordered, card-style plan button.
struct PlanButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Theme.text)
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                    .stroke(Theme.accent.opacity(0.5), lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
