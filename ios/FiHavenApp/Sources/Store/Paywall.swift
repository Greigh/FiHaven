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

/// "PRO" pill.
struct ProBadge: View {
    var body: some View {
        Text("PRO")
            .font(Theme.mono(11, weight: .bold)).tracking(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Theme.accentBg)
            .foregroundStyle(Theme.accent)
            .clipShape(Capsule())
            .accessibilityLabel("Pro feature")
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

/// The subscription paywall: perks, plan options, promo + offer-code
/// redemption, and restore.
struct PaywallView: View {
    @EnvironmentObject var billing: StoreManager
    @Environment(\.dismiss) private var dismiss
    @State private var showRedeem = false

    private let perks: [(String, String, String)] = [
        ("chart.line.downtrend.xyaxis", "Payoff planner", "Snowball & avalanche plans + your debt-free date"),
        ("calendar", "Due-date calendar", "Every bill and card on a monthly view"),
        ("clock.arrow.circlepath", "Payment history", "Search and review everything you've paid"),
        ("star.circle.fill", "Rewards optimizer", "See which card earns the most for each purchase"),
        ("arrow.triangle.2.circlepath", "Subscription finder", "Spot recurring charges and price hikes"),
        ("chart.pie.fill", "Category budgets", "Set spending limits and track progress by category"),
        ("building.columns.fill", "Bank linking", "Auto-fetch balances via Plaid (optional)"),
        ("checkmark.seal.fill", "Autopay mark", "Auto-mark autopay items paid on their due date"),
        ("square.and.arrow.up", "Data export", "Download your full account any time"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header
                    perksCard
                    if billing.isPro { activeCard } else { plansSection }
                    footer
                }
                .padding(20)
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("FiHaven Pro")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .sheet(isPresented: $showRedeem) { RedeemCodeView() }
            .alert("Notice", isPresented: messageBinding) {
                Button("OK") { billing.message = nil }
            } message: {
                Text(billing.message ?? "")
            }
        }
    }

    private var messageBinding: Binding<Bool> {
        Binding(get: { billing.message != nil },
                set: { if !$0 { billing.message = nil } })
    }

    private var header: some View {
        VStack(spacing: 8) {
            Wordmark(size: 30)
            ProBadge()
            Text("Unlock the planning tools that turn your bills into a payoff plan.")
                .font(Theme.ui(15)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var perksCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(perks, id: \.1) { icon, title, sub in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: icon)
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                        Text(sub).font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(title). \(sub)")
            }
        }
        .ctCard()
    }

    private var plansSection: some View {
        VStack(spacing: 12) {
            if billing.loadingProducts {
                ProgressView().padding()
            } else if billing.products.isEmpty {
                Text("Subscriptions aren’t available right now. You can still redeem a code below.")
                    .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            } else {
                ForEach(billing.products, id: \.id) { product in
                    Button {
                        Task { await billing.purchase(product) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.displayName).font(Theme.ui(16, weight: .semibold))
                                if let period = periodLabel(product) {
                                    Text(period).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                                }
                            }
                            Spacer()
                            Text(product.displayPrice).font(Theme.mono(16, weight: .semibold))
                        }
                    }
                    .buttonStyle(PlanButtonStyle())
                    .disabled(billing.purchasing)
                    .accessibilityLabel(planAccessibilityLabel(product))
                    .accessibilityHint("Starts purchase")
                }
                if billing.purchasing {
                    ProgressView()
                        .accessibilityLabel("Processing purchase")
                }
            }
        }
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
            if let line = renewalLine {
                Text(line).font(Theme.ui(13)).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .ctCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("FiHaven Pro is active. \(renewalLine ?? "")")
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Button("Have a promo code?") { showRedeem = true }
                .font(Theme.ui(15, weight: .semibold))
                .foregroundStyle(Theme.accent)
            Button("Redeem an App Store code") { billing.presentOfferCodeSheet() }
                .font(Theme.ui(14))
                .foregroundStyle(Theme.accent)
            Button("Restore purchases") { Task { await billing.restore() } }
                .font(Theme.ui(14))
                .foregroundStyle(Theme.muted)
            Text("Subscriptions renew automatically until cancelled. Manage or cancel anytime in your App Store account settings.")
                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
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

    private func periodLabel(_ p: Product) -> String? {
        guard let period = p.subscription?.subscriptionPeriod else { return nil }
        switch (period.unit, period.value) {
        case (.month, 1): return "Monthly"
        case (.year, 1): return "Yearly"
        case (.week, 1): return "Weekly"
        default: return nil
        }
    }

    private func planAccessibilityLabel(_ product: Product) -> String {
        let period = periodLabel(product) ?? "subscription"
        return "\(product.displayName), \(product.displayPrice), \(period)"
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

/// Promo-code entry (server-issued codes). A `free_sub` flips the user to
/// Pro immediately; a `store_offer` hands off to Apple's offer-code sheet.
struct RedeemCodeView: View {
    @EnvironmentObject var billing: StoreManager
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var busy = false
    @State private var success: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                FieldLabel(text: "Promo code")
                TextField("e.g. FREEPRO30", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(Theme.mono(16))
                    .padding(14)
                    .background(Theme.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))

                Button {
                    redeem()
                } label: {
                    if busy { ProgressView() } else { Text("Redeem") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || code.trimmingCharacters(in: .whitespaces).isEmpty)

                if let success {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.green)
                        Text(success)
                            .font(Theme.ui(14))
                            .foregroundStyle(Theme.text)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(success)
                }
                if let msg = billing.message {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(Theme.red)
                        Text(msg)
                            .font(Theme.ui(14))
                            .foregroundStyle(Theme.text)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Error. \(msg)")
                }
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("Redeem a code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private func redeem() {
        billing.message = nil
        success = nil
        Task {
            busy = true
            defer { busy = false }
            guard let result = await billing.redeemPromo(code) else { return }
            if result.kind == "store_offer" {
                billing.presentOfferCodeSheet()
                dismiss()
            } else if result.entitlement?.pro == true {
                success = "You’re now on FiHaven Pro 🎉"
            }
        }
    }
}
