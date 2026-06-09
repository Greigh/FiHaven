import SwiftUI

/// Pre-login first-run intro. Shown once before the auth screen (gated on
/// the local `fh_intro_seen` flag — there's no account yet) to explain what
/// FiHaven is and which features are free vs Pro.
struct IntroView: View {
    @AppStorage("fh_intro_seen") private var introSeen = false
    @State private var step = 0

    private struct Page { let icon: String; let title: String; let body: String; let badge: String? }
    private let pages: [Page] = [
        Page(icon: "wallet.pass.fill", title: "Welcome to FiHaven",
             body: "Track recurring bills, credit cards, and debt payoff — five calm minutes a week instead of a frantic afternoon every payday.",
             badge: nil),
        Page(icon: "checkmark.seal.fill", title: "Free to use",
             body: "Your dashboard, bills, cards, and monthly budget are always free. Create an account and start in minutes.",
             badge: "FREE"),
        Page(icon: "crown.fill", title: "FiHaven Pro",
             body: "Unlock the payoff planner, calendar, and full payment history with Pro. Start free and upgrade anytime — one subscription across web, iOS, and Android.",
             badge: "PRO"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Skip") { introSeen = true }
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer(minLength: 0)

            VStack(spacing: 18) {
                Image(systemName: pages[step].icon)
                    .font(.system(size: 54))
                    .foregroundStyle(Theme.accent)
                if let badge = pages[step].badge {
                    Text(badge)
                        .font(Theme.ui(11, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(badge == "PRO" ? Theme.accent : Theme.green)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background((badge == "PRO" ? Theme.accent : Theme.green).opacity(0.14))
                        .clipShape(Capsule())
                }
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
                if step < pages.count - 1 { withAnimation { step += 1 } } else { introSeen = true }
            } label: {
                Text(step < pages.count - 1 ? "Next" : "Get started")
            }
            .buttonStyle(PrimaryButtonStyle(enabled: true))
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }
}
