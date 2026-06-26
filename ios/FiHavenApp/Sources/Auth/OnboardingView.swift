import SwiftUI

/// First-run onboarding, shown once after a new account confirms its email
/// (gated on `user.onboarded`). Mirrors the web /welcome flow: a goals
/// question that tailors the tab bar, a short tour, then a "Get started"
/// that marks onboarding complete server-side.
struct OnboardingView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = 0
    @State private var finishing = false
    @State private var selectedGoals: Set<Goal> = []
    @State private var showPaywall = false

    /// What a new user wants from FiHaven. Each goal surfaces its tabs in the
    /// bottom bar so people land on the features they actually came for.
    enum Goal: String, CaseIterable, Identifiable {
        case bills, debt, budget, rewards, subscriptions
        var id: String { rawValue }

        var title: String {
            switch self {
            case .bills: return "Stay on top of bills"
            case .debt: return "Pay off credit cards & debt"
            case .budget: return "Budget each month"
            case .rewards: return "Maximize card rewards"
            case .subscriptions: return "Track subscriptions"
            }
        }
        var icon: String {
            switch self {
            case .bills: return "doc.text.fill"
            case .debt: return "chart.line.downtrend.xyaxis"
            case .budget: return "chart.pie.fill"
            case .rewards: return "star.circle.fill"
            case .subscriptions: return "arrow.triangle.2.circlepath"
            }
        }
        /// Tabs to surface for this goal (in priority order).
        var tabs: [TabItem] {
            switch self {
            case .bills: return [.bills, .calendar]
            case .debt: return [.cards, .payoff]
            case .budget: return [.budget, .spending]
            case .rewards: return [.rewards]
            case .subscriptions: return [.subscriptions]
            }
        }
    }

    private struct Page {
        let icon: String
        let title: String
        let body: String
        var features: [(icon: String, text: String)] = []
    }
    private let pages: [Page] = [
        Page(icon: "lock.shield.fill", title: "Secure your account",
             body: "Add two-factor authentication anytime from Settings → Security for an extra layer of protection."),
        Page(icon: "doc.text.fill", title: "Track bills & cards",
             body: "Add recurring bills and credit cards — including 0% promo periods — from the Bills and Cards tabs."),
        Page(icon: "crown.fill", title: "FiHaven Pro",
             body: "Start free and upgrade anytime — one subscription across web, iOS, and Android.",
             features: [
                ("chart.line.downtrend.xyaxis", "Payoff planner & debt-free date"),
                ("person.2.fill", "Family sharing for your household"),
                ("calendar", "Due-date calendar & full history"),
                ("star.circle.fill", "Rewards & subscription finder"),
                ("chart.pie.fill", "Category budgets & bank linking"),
             ]),
    ]

    // Step 0 is the goals question; steps 1...pages.count are the tour.
    private var totalSteps: Int { pages.count + 1 }
    private var isGoalsStep: Bool { step == 0 }
    private var isLast: Bool { step == totalSteps - 1 }

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

            if isGoalsStep { goalsStep } else { tourStep(pages[step - 1]) }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                ForEach(0..<totalSteps, id: \.self) { i in
                    Capsule()
                        .fill(i == step ? Theme.accent : Theme.border)
                        .frame(width: i == step ? 22 : 8, height: 8)
                        .animationIfAllowed(.spring(response: 0.3), value: step)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Step \(step + 1) of \(totalSteps)")
            .padding(.bottom, 20)

            if isLast {
                // Premium decision point. StoreKit owns the trial-vs-price
                // choice on its own sheet, so a single entry point avoids a
                // redundant pair of buttons that open the same paywall.
                VStack(spacing: 10) {
                    Button("See Premium plans") { showPaywall = true }
                        .buttonStyle(PrimaryButtonStyle(enabled: !finishing))
                        .disabled(finishing)
                    Button(finishing ? "Getting started…" : "Continue with Free") { finish() }
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .disabled(finishing)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 30)
            } else {
                Button {
                    performWithAnimation(!reduceMotion) { step += 1 }
                } label: {
                    Text(buttonLabel)
                }
                .buttonStyle(PrimaryButtonStyle(enabled: !finishing))
                .disabled(finishing)
                .padding(.horizontal, 24)
                .padding(.bottom, 30)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .sheet(isPresented: $showPaywall) {
            PaywallView().environmentObject(env.billing)
        }
    }

    // ── Goals question ───────────────────────────────────────────────
    private var goalsStep: some View {
        VStack(spacing: 18) {
            VStack(spacing: 10) {
                Text("What brings you to FiHaven?")
                    .font(Theme.ui(26, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                Text("Pick what matters — we’ll put those features front and center. You can change this anytime in Settings.")
                    .font(Theme.ui(15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 10) {
                ForEach(Goal.allCases) { goal in
                    goalRow(goal)
                }
            }
        }
        .padding(.horizontal, 28)
    }

    private func goalRow(_ goal: Goal) -> some View {
        let selected = selectedGoals.contains(goal)
        return Button {
            if selected { selectedGoals.remove(goal) } else { selectedGoals.insert(goal) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: goal.icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(selected ? Theme.accent : Theme.muted)
                    .frame(width: 26)
                Text(goal.title)
                    .font(Theme.ui(16, weight: .medium))
                    .foregroundStyle(Theme.text)
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Theme.accent : Theme.border)
                    .accessibilityHidden(true)
            }
            .padding(14)
            .background(selected ? Theme.accentBg : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard)
                    .stroke(selected ? Theme.accent : Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(goal.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(selected ? "Selected. Double tap to deselect." : "Double tap to select.")
    }

    // ── Tour page ────────────────────────────────────────────────────
    private func tourStep(_ page: Page) -> some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Theme.accent.opacity(0.12))
                    .frame(width: 120, height: 120)
                Image(systemName: page.icon)
                    .font(.system(size: 50))
                    .foregroundStyle(Theme.accent)
                    .accessibilityHidden(true)
            }
            .accessibilityLabel(page.title)
            Text(page.title)
                .font(Theme.ui(26, weight: .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(page.body)
                .font(Theme.ui(16))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

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
    }

    private var buttonLabel: String {
        if isGoalsStep { return selectedGoals.isEmpty ? "Skip for now" : "Continue" }
        if !isLast { return "Next" }
        return finishing ? "Getting started…" : "Get started"
    }

    /// Surface the tabs for the chosen goals in the bottom bar (dashboard
    /// first, then chosen features, then the rest fall into "More").
    private func applyGoalTabs() {
        guard !selectedGoals.isEmpty, let store = env.store else { return }
        var ordered: [TabItem] = [.dashboard]
        for goal in Goal.allCases where selectedGoals.contains(goal) {
            for tab in goal.tabs where !ordered.contains(tab) { ordered.append(tab) }
        }
        for tab in defaultBottomTabs + TabItem.allCases where !ordered.contains(tab) { ordered.append(tab) }
        store.setTabs(ordered.map(\.rawValue))
    }

    private func finish() {
        guard !finishing else { return }
        finishing = true
        applyGoalTabs()
        Task { await env.completeOnboarding() }
    }
}
