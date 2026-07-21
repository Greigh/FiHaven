import SwiftUI

/// First-run onboarding after email confirm (`user.onboarded`). Goals tailor
/// the tab bar; Back revises choices; Free CTA only after Premium / “Not now”.
struct OnboardingView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step: Step = .goals
    @State private var finishing = false
    @State private var selectedGoals: Set<Goal> = []
    @State private var budgetDetailed = true
    @State private var archiveInstead = true
    @State private var freeUnlocked = false
    @State private var showPaywall = false

    enum Step: Int, CaseIterable {
        case goals, plan, security, pro
    }

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
        var blurb: String {
            switch self {
            case .bills: return "Bills + calendar up front"
            case .debt: return "Cards + payoff planner"
            case .budget: return "Budget + spending"
            case .rewards: return "Rewards picker"
            case .subscriptions: return "Subscription finder"
            }
        }
        var icon: String {
            switch self {
            case .bills: return "doc.text.fill"
            case .debt: return "creditcard.fill"
            case .budget: return "chart.pie.fill"
            case .rewards: return "star.circle.fill"
            case .subscriptions: return "arrow.triangle.2.circlepath"
            }
        }
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

    private var stepIndex: Int { step.rawValue }
    private var isLast: Bool { step == .pro }

    private let proFeatures: [(icon: String, text: String)] = [
        ("chart.line.downtrend.xyaxis", "Payoff planner & debt-free date"),
        ("person.2.fill", "Family sharing for your household"),
        ("calendar", "Due-date calendar & full history"),
        ("star.circle.fill", "Rewards & subscription finder"),
        ("chart.pie.fill", "Category budgets & bank linking"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if stepIndex > 0 {
                    Button { goBack() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.text)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(finishing)
                    .accessibilityLabel("Back")
                } else {
                    Color.clear.frame(width: 44, height: 44)
                }
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 12)
            .padding(.top, 4)

            ScrollView {
                Group {
                    switch step {
                    case .goals: goalsStep
                    case .plan: planStep
                    case .security: securityStep
                    case .pro: proStep
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
            }

            HStack(spacing: 8) {
                ForEach(Step.allCases, id: \.rawValue) { s in
                    Capsule()
                        .fill(s == step ? Theme.accent : Theme.border)
                        .frame(width: s == step ? 22 : 8, height: 8)
                        .animationIfAllowed(.spring(response: 0.3), value: step)
                        .onTapGesture {
                            guard !finishing, s.rawValue < stepIndex else { return }
                            performWithAnimation(!reduceMotion) { step = s }
                        }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Step \(stepIndex + 1) of \(Step.allCases.count)")
            .padding(.bottom, 16)

            footer
                .padding(.horizontal, 24)
                .padding(.bottom, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .sheet(isPresented: $showPaywall, onDismiss: { freeUnlocked = true }) {
            PaywallView().environmentObject(env.billing)
        }
    }

    @ViewBuilder
    private var footer: some View {
        if isLast {
            VStack(spacing: 10) {
                Button("See Premium plans") { showPaywall = true }
                    .buttonStyle(PrimaryButtonStyle(enabled: !finishing))
                    .disabled(finishing)
                if freeUnlocked {
                    Button(finishing ? "Getting started…" : "Continue with Free") { finish() }
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .disabled(finishing)
                } else {
                    Button("Not now") { freeUnlocked = true }
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .disabled(finishing)
                }
            }
        } else {
            Button {
                performWithAnimation(!reduceMotion) { goNext() }
            } label: {
                Text(primaryLabel)
            }
            .buttonStyle(PrimaryButtonStyle(enabled: !finishing))
            .disabled(finishing)
        }
    }

    private var primaryLabel: String {
        switch step {
        case .goals: return selectedGoals.isEmpty ? "Skip for now" : "Continue"
        case .plan: return "Looks good"
        case .security: return "Next"
        case .pro: return "Next"
        }
    }

    // ── Goals ────────────────────────────────────────────────────────
    private var goalsStep: some View {
        VStack(spacing: 18) {
            VStack(spacing: 10) {
                Text("What brings you to FiHaven?")
                    .font(Theme.ui(26, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                Text("Pick one or more — we’ll put those tabs front and center. You can change this anytime.")
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
            if selectedGoals.contains(.budget) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("How do you like to budget?")
                        .font(Theme.ui(14, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    budgetChoice("Detailed — I’ll track categories myself", selected: budgetDetailed) {
                        budgetDetailed = true
                    }
                    budgetChoice("Simple — use the 50/30/20 rule", selected: !budgetDetailed) {
                        budgetDetailed = false
                    }
                }
                .padding(.top, 4)
            }
        }
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
                VStack(alignment: .leading, spacing: 2) {
                    Text(goal.title)
                        .font(Theme.ui(16, weight: .medium))
                        .foregroundStyle(Theme.text)
                    Text(goal.blurb)
                        .font(Theme.ui(12))
                        .foregroundStyle(Theme.muted)
                }
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
    }

    private func budgetChoice(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Theme.accent : Theme.border)
                Text(title)
                    .font(Theme.ui(14))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(selected ? Theme.accentBg : Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // ── Plan review ──────────────────────────────────────────────────
    private var planStep: some View {
        VStack(spacing: 18) {
            Text("Your FiHaven home")
                .font(Theme.ui(26, weight: .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(selectedGoals.isEmpty
                  ? "We’ll start you on the dashboard. You can pin features later in Settings → Customize tabs."
                  : "Based on what you picked, these will sit in your bottom bar. Change anytime.")
                .font(Theme.ui(15))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 12) {
                Text("Home")
                    .font(Theme.ui(12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                Text("Dashboard")
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                if selectedGoals.isEmpty {
                    Text("Default tabs — Bills, Cards, Spending, More")
                        .font(Theme.ui(13))
                        .foregroundStyle(Theme.muted)
                } else {
                    ForEach(Goal.allCases.filter { selectedGoals.contains($0) }) { g in
                        HStack(spacing: 10) {
                            Image(systemName: g.icon)
                                .foregroundStyle(Theme.accent)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(g.title).font(Theme.ui(15)).foregroundStyle(Theme.text)
                                Text(g.blurb).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    if selectedGoals.contains(.budget) {
                        Text(budgetDetailed ? "Budget style: detailed categories" : "Budget style: 50/30/20")
                            .font(Theme.ui(13))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.border, lineWidth: 1))

            Button("Change goals") {
                performWithAnimation(!reduceMotion) { step = .goals }
            }
            .font(Theme.ui(15, weight: .medium))
            .foregroundStyle(Theme.accent)

            Button {
                archiveInstead.toggle()
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: archiveInstead ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(archiveInstead ? Theme.accent : Theme.border)
                        .font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Archive instead of delete")
                            .font(Theme.ui(15, weight: .medium))
                            .foregroundStyle(Theme.text)
                        Text("Retire a bill, card, or loan without losing its history. Restore anytime.")
                            .font(Theme.ui(12))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radiusCard)
                        .stroke(archiveInstead ? Theme.accent : Theme.border, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 8) {
                Text("After this")
                    .font(Theme.ui(13, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                bullet("Add a few bills or cards from those tabs")
                bullet("Mark what’s paid this month from Home")
                if selectedGoals.contains(.debt) { bullet("Open Payoff to see a debt-free date") }
                if selectedGoals.contains(.rewards) { bullet("Ask Rewards which card to use") }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.accentBg, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•").foregroundStyle(Theme.accent)
            Text(text).font(Theme.ui(14)).foregroundStyle(Theme.text)
            Spacer(minLength: 0)
        }
    }

    // ── Security ─────────────────────────────────────────────────────
    private var securityStep: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle().fill(Theme.accent.opacity(0.12)).frame(width: 100, height: 100)
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Theme.accent)
            }
            Text("Lock it down")
                .font(Theme.ui(26, weight: .bold))
                .foregroundStyle(Theme.text)
            Text("Your money data stays on your account. Turn on an authenticator, passkey, or biometric unlock anytime from Settings → Security — it takes about a minute.")
                .font(Theme.ui(16))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 14) {
                securityRow("Authenticator app", "Codes that rotate every 30 seconds")
                securityRow("Passkeys", "Sign in with Face ID / Touch ID")
                securityRow("App lock", "Require biometrics when you leave FiHaven")
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.border, lineWidth: 1))
        }
    }

    private func securityRow(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
            Text(body).font(Theme.ui(13)).foregroundStyle(Theme.muted)
        }
    }

    // ── Pro ──────────────────────────────────────────────────────────
    private var proStep: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle().fill(Theme.accent.opacity(0.12)).frame(width: 100, height: 100)
                Image(systemName: "crown.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Theme.accent)
            }
            Text("FiHaven Pro")
                .font(Theme.ui(26, weight: .bold))
                .foregroundStyle(Theme.text)
            Text("Free covers the basics. Pro unlocks planning tools that keep working across web, iOS, and Android.")
                .font(Theme.ui(16))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 14) {
                ForEach(proFeatures.indices, id: \.self) { i in
                    let f = proFeatures[i]
                    HStack(spacing: 12) {
                        Image(systemName: f.icon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 26)
                        Text(f.text).font(Theme.ui(15)).foregroundStyle(Theme.text)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.border, lineWidth: 1))
        }
    }

    // ── Navigation helpers ───────────────────────────────────────────
    private func goBack() {
        guard let prev = Step(rawValue: stepIndex - 1) else { return }
        performWithAnimation(!reduceMotion) { step = prev }
    }

    private func goNext() {
        guard let next = Step(rawValue: stepIndex + 1) else { return }
        performWithAnimation(!reduceMotion) { step = next }
    }

    private func applyGoalTabs() {
        guard !selectedGoals.isEmpty, let store = env.store else { return }
        var ordered: [TabItem] = [.dashboard]
        for goal in Goal.allCases where selectedGoals.contains(goal) {
            for tab in goal.tabs where !ordered.contains(tab) { ordered.append(tab) }
        }
        // Only preferred bottom slots — everything else stays under More.
        store.setTabs(Array(ordered.prefix(maxBottomTabs)).map(\.rawValue))
        if selectedGoals.contains(.budget) {
            store.setBudgetRule(budgetDetailed ? "off" : "50-30-20")
        }
    }

    private func finish() {
        guard !finishing else { return }
        finishing = true
        applyGoalTabs()
        env.store?.setArchiveInsteadOfDelete(archiveInstead)
        Task { await env.completeOnboarding() }
    }
}
