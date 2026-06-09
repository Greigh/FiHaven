import SwiftUI

/// First-run onboarding, shown once after a new account confirms its email
/// (gated on `user.onboarded`). Mirrors the web /welcome flow: a short tour,
/// then a "Get started" that marks onboarding complete server-side.
struct OnboardingView: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var step = 0
    @State private var finishing = false

    private struct Page { let icon: String; let title: String; let body: String }
    private let pages: [Page] = [
        Page(icon: "hand.wave.fill", title: "Welcome to FiHaven",
             body: "A calm home for your bills, cards, and debt payoff. Here's a quick tour."),
        Page(icon: "lock.shield.fill", title: "Secure your account",
             body: "Add two-factor authentication anytime from Settings → Security for an extra layer of protection."),
        Page(icon: "doc.text.fill", title: "Track bills & cards",
             body: "Add recurring bills and credit cards — including 0% promo periods — from the Bills and Cards tabs."),
        Page(icon: "crown.fill", title: "FiHaven Pro",
             body: "Unlock the payoff planner, calendar, and full history. One subscription works across web, iOS, and Android."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Skip") { finish() }
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .disabled(finishing)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer(minLength: 0)

            VStack(spacing: 20) {
                Image(systemName: pages[step].icon)
                    .font(.system(size: 54))
                    .foregroundStyle(Theme.accent)
                Text(pages[step].title)
                    .font(Theme.ui(26, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                Text(pages[step].body)
                    .font(Theme.ui(16))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 32)

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                ForEach(pages.indices, id: \.self) { i in
                    Circle()
                        .fill(i == step ? Theme.accent : Theme.border)
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.bottom, 20)

            Button {
                if step < pages.count - 1 { withAnimation { step += 1 } } else { finish() }
            } label: {
                Text(buttonLabel)
            }
            .buttonStyle(PrimaryButtonStyle(enabled: !finishing))
            .disabled(finishing)
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }

    private var buttonLabel: String {
        if step < pages.count - 1 { return "Next" }
        return finishing ? "Getting started…" : "Get started"
    }

    private func finish() {
        guard !finishing else { return }
        finishing = true
        Task { await env.completeOnboarding() }
    }
}
