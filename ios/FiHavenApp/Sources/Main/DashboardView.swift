import SwiftUI
import FiHavenCore

/// The dashboard: monthly overview + upcoming items, built from the
/// store's derived values (Income / Schedule from FiHavenCore).
struct DashboardView: View {
    @EnvironmentObject var store: AppStore
    @State private var paying: PayTarget?
    @State private var skipPrompt: SkipPrompt?
    @State private var editingBill: Bill?
    @State private var editingCard: Card?

    /// A pending "skip a card you still owe on" confirmation.
    private struct SkipPrompt: Identifiable {
        let id = UUID()
        let item: UpcomingItem
        let message: String
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if store.data.settings.dashboardLayout == "widgets" {
                    ForEach(DashboardWidget.enabled(store.data.settings), id: \.self) { id in
                        widget(id)
                    }
                } else {
                    summary
                    upcomingSection
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar(store.monthLabel)
        .overlay {
            if !store.loaded && store.dashboardUpcoming.isEmpty {
                ProgressView()
            }
        }
        .sheet(item: $paying) { target in PayView(target: target) }
        .sheet(item: $editingBill) { bill in BillEditorView(bill: bill) }
        .sheet(item: $editingCard) { card in CardEditorView(card: card) }
        .alert(
            "Skip this month?",
            isPresented: Binding(get: { skipPrompt != nil }, set: { if !$0 { skipPrompt = nil } }),
            presenting: skipPrompt
        ) { prompt in
            Button("Skip anyway", role: .destructive) {
                store.skipMonth(type: prompt.item.type, refId: prompt.item.refId, name: prompt.item.name)
            }
            Button("Cancel", role: .cancel) {}
        } message: { prompt in
            Text(prompt.message)
        }
    }

    /// Skip an upcoming item — but for a card you still owe on, confirm first.
    private func requestSkip(_ item: UpcomingItem) {
        if item.type == "card", let warning = store.cardSkipWarning(refId: item.refId, name: item.name) {
            skipPrompt = SkipPrompt(item: item, message: warning)
        } else {
            store.skipMonth(type: item.type, refId: item.refId, name: item.name)
        }
    }

    // ── Widget rendering (Widgets layout) ────────────────────────────
    @ViewBuilder
    private func widget(_ id: String) -> some View {
        switch id {
        case "stats":         summary
        case "cashflow":      CashflowWidget()
        case "alerts":        AlertsWidget()
        case "upcoming":      upcomingSection
        case "networth":
            netWorthCard
        case "spending":      statCard("Spent this period", Money.fmt(store.totalSpent), Theme.accent)
        case "goals":         GoalsWidget()
        case "subscriptions": SubscriptionsWidget()
        case "incomeHistory": IncomeHistoryWidget()
        case "budgetStatus": BudgetStatusWidget()
        default:              EmptyView()
        }
    }

    private var netWorthCard: some View {
        let positive = store.netWorth >= 0
        return VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: "Net worth")
            SemanticAmount(
                value: Money.fmt(store.netWorth),
                tone: positive ? .positive : .negative,
                font: Theme.mono(22, weight: .semibold),
                statusWords: positive ? "Positive" : "Negative"
            )
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ctCard()
    }

    private func statCard(_ label: String, _ value: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: label)
            Text(value).font(Theme.mono(22, weight: .semibold)).foregroundStyle(accent)
                .minimumScaleFactor(0.6).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ctCard()
    }

    // ── Summary cards ────────────────────────────────────────────────
    private var summary: some View {
        HStack(spacing: 12) {
            incomeStat
            stat(store.owedLabel, Money.fmt(store.remainingThisMonth), Theme.accent)
        }
    }

    private var incomeStat: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: store.incomeLabel)
            SemanticAmount(
                value: Money.fmt(store.periodIncome),
                tone: .positive,
                font: Theme.mono(22, weight: .semibold)
            )
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        .ctCard()
    }

    private func stat(_ label: String, _ value: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: label)
            Text(value)
                .font(Theme.mono(22, weight: .semibold))
                .foregroundStyle(accent)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .ctCard()
    }

    // ── Upcoming ─────────────────────────────────────────────────────
    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Upcoming")
                .font(Theme.ui(13, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(Theme.muted)

            if store.dashboardUpcoming.isEmpty {
                Text(store.loaded ? "Nothing scheduled — add a bill or card." : "Loading…")
                    .font(Theme.ui(15))
                    .foregroundStyle(Theme.muted)
                    .ctCard()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(store.dashboardUpcoming.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { Divider().overlay(Theme.border) }
                        UpcomingRow(
                            item: item,
                            state: store.paidState(item),
                            paidSoFar: store.paidAmount(item),
                            goal: store.goalAmount(item),
                            remaining: store.remaining(item),
                            tz: store.tz,
                            periodNoun: store.periodNoun(item)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { paying = PayTarget(item) }
                        .contextMenu {
                            Button { paying = PayTarget(item) } label: {
                                Label("Pay", systemImage: "dollarsign.circle")
                            }
                            Button {
                                if item.type == "bill" {
                                    editingBill = store.data.bills.first { String($0.id) == item.refId }
                                } else {
                                    editingCard = store.data.cards.first { String($0.id) == item.refId }
                                }
                            } label: {
                                Label(item.type == "bill" ? "Edit bill" : "Edit card", systemImage: "pencil")
                            }
                            if store.isSkipped(item) {
                                Button { store.unskip(type: item.type, refId: item.refId) } label: {
                                    Label("Un-skip \(store.periodNoun(item))", systemImage: "arrow.uturn.backward")
                                }
                            } else {
                                Button { requestSkip(item) } label: {
                                    Label("Skip this \(store.periodNoun(item))", systemImage: "forward.end")
                                }
                            }
                        }
                    }
                }
                .ctCard(padding: 0)
            }
        }
    }
}

private struct UpcomingRow: View {
    let item: UpcomingItem
    let state: PaidState
    let paidSoFar: Double
    let goal: Double
    let remaining: Double
    let tz: TimeZone
    var periodNoun: String = "month"

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Image(systemName: A11y.paidStateIcon(state))
                    .font(.system(size: 18))
                    .foregroundStyle(labelColor)
                Text(A11y.paidStateLabel(state))
                    .font(Theme.ui(9, weight: .medium))
                    .foregroundStyle(labelColor)
            }
            .frame(width: 44)
            .accessibilityHidden(true)

            Text(item.icon).font(.system(size: 22))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                Text(dueLabel)
                    .font(Theme.ui(12))
                    .foregroundStyle(labelColor)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.fmt(state == .full ? goal : remaining))
                    .font(Theme.mono(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                if item.autopay {
                    Text("autopay")
                        .font(Theme.mono(9))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(dueLabel), \(Money.fmt(state == .full ? goal : remaining))")
    }

    private var labelColor: Color {
        switch state {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return dueColor
        }
    }

    private var dueColor: Color {
        if item.days < 0 { return Theme.red }
        if item.days <= 3 { return Theme.orange }
        return Theme.muted
    }

    private var dueLabel: String {
        switch state {
        case .full: return "Paid this \(periodNoun)"
        case .partial: return "Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))"
        case .unpaid: break
        }
        let when: String
        switch item.days {
        case ..<0: when = "Overdue"
        case 0: when = "Due today"
        case 1: when = "Due tomorrow"
        default: when = "Due in \(item.days) days"
        }
        if let next = item.nextDue {
            return "\(when) · \(Self.short(next, tz: tz))"
        }
        return when
    }

    private static func short(_ date: Date, tz: TimeZone) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
