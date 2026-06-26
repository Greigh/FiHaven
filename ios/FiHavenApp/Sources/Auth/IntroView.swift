import SwiftUI

/// Pre-login first-run intro. Shown once before the auth screen (gated on
/// the local `fh_intro_seen` flag — there's no account yet) to explain what
/// FiHaven is and which features are free vs Pro.
struct IntroView: View {
    @AppStorage("fh_intro_seen") private var introSeen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = 0

    private struct Feature { let icon: String; let text: String }
    private struct Page {
        let icon: String
        let title: String
        let body: String
        let badge: String?
        let brand: Bool          // show the FiHaven mark instead of an SF Symbol
        var features: [Feature] = []
    }

    private let pages: [Page] = [
        Page(icon: "wallet.pass.fill", title: "Welcome to FiHaven",
             body: "Five calm minutes a week instead of a frantic afternoon every payday.",
             badge: nil, brand: true,
             features: [
                Feature(icon: "list.bullet.rectangle.fill", text: "Track recurring bills in one place"),
                Feature(icon: "creditcard.fill", text: "Credit cards & 0% promo periods"),
                Feature(icon: "chart.line.uptrend.xyaxis", text: "A clear plan to pay down debt"),
             ]),
        Page(icon: "checkmark.seal.fill", title: "Free to use",
             body: "Your dashboard, bills, cards, and monthly budget are always free. Create an account and start in minutes.",
             badge: "FREE", brand: false),
        Page(icon: "crown.fill", title: "FiHaven Pro",
             body: "Start free and upgrade anytime — one subscription across web, iOS, and Android.",
             badge: "PRO", brand: false,
             features: [
                Feature(icon: "chart.line.downtrend.xyaxis", text: "Payoff planner & debt-free date"),
                Feature(icon: "person.2.fill", text: "Family sharing for your household"),
                Feature(icon: "calendar", text: "Due-date calendar & full history"),
                Feature(icon: "star.circle.fill", text: "Rewards & subscription finder"),
                Feature(icon: "chart.pie.fill", text: "Category budgets & bank linking"),
             ]),
    ]

    private var page: Page { pages[step] }
    private var isLast: Bool { step == pages.count - 1 }
    private var accentForBadge: Color { page.badge == "PRO" ? Theme.accent : Theme.green }

    var body: some View {
        VStack(spacing: 0) {
            header
            Spacer(minLength: 0)
            hero
            Spacer(minLength: 0)
            footer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }

    // ── Top bar: wordmark + skip ─────────────────────────────────────
    private var header: some View {
        HStack {
            Wordmark(size: 22)
            Spacer()
            if !isLast {
                Button("Skip") { introSeen = true }
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
    }

    // ── Hero: tinted badge + title/body (+ features on page 1) ───────
    private var hero: some View {
        VStack(spacing: 20) {
            heroBadge

            VStack(spacing: 12) {
                if let badge = page.badge {
                    Text(badge)
                        .font(Theme.ui(11, weight: .bold)).tracking(1.2)
                        .foregroundStyle(accentForBadge)
                        .padding(.horizontal, 11).padding(.vertical, 4)
                        .background(accentForBadge.opacity(0.14))
                        .clipShape(Capsule())
                }
                Text(page.title)
                    .font(Theme.ui(28, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(page.body)
                    .font(Theme.ui(16))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !page.features.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(page.features.indices, id: \.self) { i in
                        let f = page.features[i]
                        HStack(spacing: 12) {
                            Image(systemName: f.icon)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                                .frame(width: 26)
                                .accessibilityHidden(true)
                            Text(f.text)
                                .font(Theme.ui(15))
                                .foregroundStyle(Theme.text)
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.border, lineWidth: 1))
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 32)
        .id(step) // re-run the transition when the page changes
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .trailing)))
    }

    /// A soft gradient disc with the FiHaven mark (page 1) or page glyph.
    private var heroBadge: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(
                    colors: [Theme.accent.opacity(0.18), accentForBadge.opacity(0.06)],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 132, height: 132)
            if page.brand {
                BrandMark(size: 72)
            } else {
                Image(systemName: page.icon)
                    .font(.system(size: 52))
                    .foregroundStyle(accentForBadge)
            }
        }
        .accessibilityLabel(page.title)
    }

    // ── Footer: progress dots + primary button ───────────────────────
    private var footer: some View {
        VStack(spacing: 20) {
            HStack(spacing: 8) {
                ForEach(pages.indices, id: \.self) { i in
                    Capsule()
                        .fill(i == step ? Theme.accent : Theme.border)
                        .frame(width: i == step ? 22 : 8, height: 8)
                        .animationIfAllowed(.spring(response: 0.3), value: step)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Page \(step + 1) of \(pages.count)")

            Button {
                if isLast {
                    introSeen = true
                } else {
                    performWithAnimation(!reduceMotion) { step += 1 }
                }
            } label: {
                Text(isLast ? "Get started" : "Next")
            }
            .buttonStyle(PrimaryButtonStyle(enabled: true))
            .padding(.horizontal, 24)
        }
        .padding(.bottom, 30)
    }
}
