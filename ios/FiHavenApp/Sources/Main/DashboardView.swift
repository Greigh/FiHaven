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
    @State private var rolloverReview = false

    /// A pending "skip a card you still owe on" confirmation.
    private struct SkipPrompt: Identifiable {
        let id = UUID()
        let item: UpcomingItem
        let message: String
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let prompt = store.rolloverPrompt {
                    rolloverCard(prompt)
                }
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
        .sheet(isPresented: $rolloverReview) { RolloverReviewView().environmentObject(store) }
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

    /// Open the editor behind an upcoming item (its bill, or its card).
    private func edit(_ item: UpcomingItem) {
        if item.type == "bill" {
            editingBill = store.data.bills.first { String($0.id) == item.refId }
        } else {
            editingCard = store.data.cards.first { String($0.id) == item.refId }
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
        case "debt":
            statCard("Card debt", Money.fmt(store.cardDebt), store.cardDebt > 0 ? Theme.accent : Theme.green)
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
    // Overview tiles. Card debt rides along here as well as being its own
    // widget, so Classic shows it too — web's overview strip has carried it
    // all along.
    private var summary: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                incomeStat
                stat(store.owedLabel, Money.fmt(store.remainingThisMonth), Theme.accent)
            }
            statCard("Card debt", Money.fmt(store.cardDebt), store.cardDebt > 0 ? Theme.accent : Theme.green)
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
                            periodNoun: store.periodNoun(item),
                            skipped: store.isSkipped(item),
                            needsAmount: store.needsAmount(item),
                            nothingDue: store.nothingDue(item),
                            onPay: { paying = PayTarget(item) },
                            onUnmark: {
                                store.setPaid(type: item.type, refId: item.refId, name: item.name,
                                              amount: store.goalAmount(item), paid: false)
                            },
                            onSkip: { requestSkip(item) },
                            onUnskip: { store.unskip(type: item.type, refId: item.refId) },
                            onConfirmZero: { store.confirmZeroAmount(type: item.type, refId: item.refId) }
                        )
                        .contentShape(Rectangle())
                        // Tapping the row body opens the editor, never the pay
                        // sheet: that sheet pre-fills the full amount, so a tap
                        // meant as "let me look at this bill" (or as a reach for
                        // its "Note (optional)" field) marked the item paid and —
                        // with hidePaidOnDashboard on by default — made it vanish
                        // from Upcoming. Paying is now its own button.
                        .onTapGesture { edit(item) }
                        .contextMenu {
                            Button { paying = PayTarget(item) } label: {
                                Label("Pay", systemImage: "dollarsign.circle")
                            }
                            Button { edit(item) } label: {
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

    // ── Monthly rollover ─────────────────────────────────────────────
    private func rolloverCard(_ prompt: AppStore.RolloverPrompt) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Text("🗓").font(.system(size: 22))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Welcome to \(prompt.currLabel)!")
                        .font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                    Text(missedSummary(prompt))
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 12) {
                Spacer()
                Button("Dismiss") { store.dismissRolloverPrompt() }
                    .font(Theme.ui(14)).foregroundStyle(Theme.muted)
                Button("Set \(monthWord(prompt.currLabel)) amounts") { rolloverReview = true }
                    .buttonStyle(.borderedProminent).tint(Theme.accent)
            }
        }
        .ctCard()
    }

    private func missedSummary(_ prompt: AppStore.RolloverPrompt) -> String {
        if prompt.missedNames.isEmpty {
            return "Everything from \(prompt.prevLabel) was marked paid. Great work!"
        }
        let shown = prompt.missedNames.prefix(6).joined(separator: ", ")
        let more = prompt.missedNames.count > 6 ? " and \(prompt.missedNames.count - 6) more" : ""
        return "\(prompt.missedNames.count) from \(prompt.prevLabel) never marked paid: \(shown)\(more)."
    }

    private func monthWord(_ label: String) -> String {
        String(label.split(separator: " ").first ?? "")
    }
}

// Full-screen review of each active bill's amount for the new month.
private struct RolloverReviewView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var amounts: [String: String] = [:]
    @State private var editingBill: Bill?
    @State private var lastEditedId: String?
    // Scanning the schedule per row is too much to redo on every keystroke.
    @State private var dueLabels: [String: DueLabel] = [:]

    private struct DueLabel { let text: String; let late: Bool }

    private var bills: [Bill] { store.rolloverBills() }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Pre-filled from your rollover setting. Adjust any that changed — clear a field to keep that bill as-is.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                }
                if bills.isEmpty {
                    Text("No active bills to review.").foregroundStyle(Theme.muted)
                } else {
                    Section("\(bills.count) bill\(bills.count == 1 ? "" : "s")") {
                        ForEach(bills) { bill in row(bill) }
                    }
                }
            }
            .navigationTitle("Review bills")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
            }
            .onAppear(perform: seed)
            .sheet(item: $editingBill, onDismiss: reseedEdited) { bill in BillEditorView(bill: bill) }
        }
    }

    // String binding on the amount: a blank field must stay blank so an
    // unreviewed bill isn't silently zeroed.
    private func row(_ bill: Bill) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(bill.name).foregroundStyle(Theme.text)
                if let due = dueLabels[String(bill.id)] {
                    Text(due.text)
                        .font(Theme.ui(12))
                        .foregroundStyle(due.late ? Theme.red : Theme.muted)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 2) {
                Text("$").foregroundStyle(Theme.muted)
                TextField("0.00", text: binding(for: bill))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.leading)
            }
            .frame(width: 104, alignment: .leading)
            Button {
                lastEditedId = String(bill.id)
                editingBill = bill
            } label: {
                Image(systemName: "square.and.pencil").foregroundStyle(Theme.accent)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Edit \(bill.name)")
        }
    }

    /// "Due Aug 5" / "Autopays Aug 5" for the month being reviewed, flagged when
    /// that date has already passed unpaid.
    private func dueLabel(_ bill: Bill) -> DueLabel? {
        guard let due = store.rolloverDueDate(bill) else { return nil }
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        let paid = Schedule.isPaid(
            store.data.payments, type: "bill", refId: String(bill.id), monthKey: store.currentMonthKey
        )
        return DueLabel(
            text: "\(bill.autopay ? "Autopays" : "Due") \(f.string(from: due))",
            late: !paid && due < DateLogic.today(tz: store.tz)
        )
    }

    private func seed() {
        guard amounts.isEmpty else { return }
        for b in bills {
            amounts[String(b.id)] = prefill(b)
            dueLabels[String(b.id)] = dueLabel(b)
        }
    }

    private func prefill(_ bill: Bill) -> String {
        let pre = store.rolloverPrefillAmount(bill)
        return pre > 0 ? String(format: "%.2f", pre) : ""
    }

    /// After an edit, the row re-prefills from the bill's new amount rather
    /// than the stale value that was sitting in the field.
    private func reseedEdited() {
        guard let id = lastEditedId, let bill = bills.first(where: { String($0.id) == id }) else { return }
        amounts[id] = prefill(bill)
        dueLabels[id] = dueLabel(bill)   // the day may have moved too
        lastEditedId = nil
    }

    private func binding(for bill: Bill) -> Binding<String> {
        Binding(
            get: { amounts[String(bill.id)] ?? "" },
            set: { amounts[String(bill.id)] = $0 }
        )
    }

    private func save() {
        var map: [String: Double] = [:]
        for b in bills {
            if let s = amounts[String(b.id)], !s.trimmingCharacters(in: .whitespaces).isEmpty, let v = Double(s) {
                map[String(b.id)] = v
            }
        }
        store.applyRolloverAmounts(map)
        // The review is the whole point of the new-month card, so retire it
        // once amounts are in rather than making the user dismiss it too.
        store.dismissRolloverPrompt()
        dismiss()
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
    var skipped: Bool = false
    var needsAmount: Bool = false
    var nothingDue: Bool = false
    let onPay: () -> Void
    let onUnmark: () -> Void
    let onSkip: () -> Void
    let onUnskip: () -> Void
    var onConfirmZero: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
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

                IconMark(icon: item.icon, size: 22)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(Theme.ui(15, weight: .medium))
                        .foregroundStyle(Theme.text)
                    // Who it's actually paid to — the name above is often a nickname.
                    if !item.business.isEmpty {
                        Text(item.business)
                            .font(Theme.ui(12))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
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
            // Combined on the info half only, so the actions below stay their
            // own VoiceOver elements instead of being swallowed by the row.
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(item.name), \(statusLine), \(Money.fmt(state == .full ? goal : remaining))")
            .accessibilityHint("Double tap to edit")

            // Actions spelled out, matching the Bills tab and the web dashboard.
            HStack(spacing: 16) {
                Text(statusLine)
                    .font(Theme.ui(12))
                    .foregroundStyle(skipped ? Theme.muted : labelColor)
                Spacer()
                if skipped {
                    quickAction("Undo skip", Theme.accent, onUnskip)
                } else if nothingDue {
                    // A $0 row is settled with no payment behind it: Undo deletes
                    // a payment record and would find none, leaving a button that
                    // does nothing. There is also nothing to pay.
                    EmptyView()
                } else if state == .full {
                    quickAction("Undo", Theme.muted, onUnmark)
                } else if needsAmount {
                    // Skip is meaningless on a row with no amount — it would hide
                    // the row for one period and leave the real gap unanswered.
                    // "It's $0" settles it for good, in a tap.
                    quickAction("It's $0", Theme.muted, onConfirmZero)
                    quickAction("Pay", Theme.accent, onPay)
                } else {
                    quickAction("Skip", Theme.muted, onSkip)
                    quickAction("Pay", Theme.accent, onPay)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func quickAction(_ label: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(Theme.ui(12, weight: .medium)).foregroundStyle(color)
        }
        .buttonStyle(.plain)
    }

    private var statusLine: String {
        if skipped { return "⏭ Skipped this \(periodNoun)" }
        // No amount means nothing to measure a payment against — say so instead
        // of counting down against $0.
        if needsAmount { return "No amount set · tap to add one" }
        if nothingDue { return "Nothing due this \(periodNoun)" }
        return dueLabel
    }

    private var labelColor: Color {
        if needsAmount { return Theme.orange }
        // Settled because nothing is owed, not because a payment landed — the
        // paid-green would claim credit for a payment that never happened.
        if nothingDue { return Theme.muted }
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
        // Derive the date from `days` rather than reusing `nextDue`. `nextDue` is
        // the next *forward* occurrence, so an overdue item paired it with next
        // period's date — a Jul 12 due date read as "Overdue · Aug 12".
        guard item.nextDue != nil,
              let due = DateLogic.calendar(tz: tz)
                  .date(byAdding: .day, value: item.days, to: DateLogic.today(tz: tz))
        else { return when }
        return "\(when) · \(Self.short(due, tz: tz))"
    }

    private static func short(_ date: Date, tz: TimeZone) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
