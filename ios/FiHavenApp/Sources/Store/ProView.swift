import SwiftUI
import FiHavenCore

/// "FiHaven Pro" — a standalone More screen for subscription status,
/// upgrade/manage, and promo redemption (lifted out of Settings).
struct ProView: View {
    @EnvironmentObject var billing: StoreManager
    @State private var showPaywall = false
    @State private var showRedeem = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                statusCard
                // "Manage Pro" opens the paywall (matching Android), which is where
                // plan options — including upgrading to Family — and the store's
                // own subscription-management link live.
                Button(billing.isPro ? "Manage Pro" : "Upgrade to Pro") { showPaywall = true }
                    .buttonStyle(PrimaryButtonStyle())
                    .accessibilityHint(billing.isPro ? "Opens plan options" : "Opens upgrade options")
                if billing.isPro, let note = billing.billingNote {
                    Text(note)
                        .font(Theme.ui(13))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                Button("Redeem a code") { showRedeem = true }
                    .font(Theme.ui(15, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(maxWidth: .infinity)
            }
            .padding(20)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("FiHaven Pro")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showPaywall) { PaywallView() }
        .sheet(isPresented: $showRedeem) { RedeemCodeView() }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Wordmark(size: 30)
            ProBadge()
            Text("Unlock the payoff planner, calendar, and payment history.")
                .font(Theme.ui(14)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var statusCard: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Status").font(Theme.ui(15)).foregroundStyle(Theme.muted)
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: billing.isPro ? "checkmark.circle.fill" : "circle")
                        .font(.caption)
                        .foregroundStyle(billing.isPro ? Theme.green : Theme.muted)
                    Text(billing.isPro ? planLabel : "Free")
                        .font(Theme.ui(15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Status, \(billing.isPro ? planLabel : "Free")")
            if billing.isPro {
                if let sourceLabel = sourceLabel {
                    HStack {
                        Text("Provider").font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(sourceLabel).font(Theme.ui(13)).foregroundStyle(Theme.text)
                    }
                }
                if let renewal = renewalLabel {
                    HStack {
                        Text((billing.entitlement.autoRenew == true) ? "Renews" : "Expires")
                            .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(renewal).font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .ctCard()
    }

    private var sourceLabel: String? {
        guard let s = billing.entitlement.source else { return nil }
        switch s {
        case "stripe": return "Stripe"
        case "apple": return "App Store"
        case "google": return "Play Store"
        case "promo": return "Promo Code"
        case "comp": return "Complimentary"
        default: return s.capitalized
        }
    }

    private var planLabel: String {
        let e = billing.entitlement
        if e.source == "promo" { return "Pro · Promo" }
        switch e.plan {
        case "trial": return "Pro · Trial"
        case "monthly": return "Pro · Monthly"
        case "three_month": return "Pro · 3 Months"
        case "yearly": return "Pro · Yearly"
        case "family": return "Pro · Family"
        default: return "Pro"
        }
    }

    private var renewalLabel: String? {
        guard let ms = billing.entitlement.expiresAt else { return nil }
        let date = Date(timeIntervalSince1970: Double(ms) / 1000)
        let f = DateFormatter(); f.dateStyle = .medium
        return f.string(from: date)
    }
}
