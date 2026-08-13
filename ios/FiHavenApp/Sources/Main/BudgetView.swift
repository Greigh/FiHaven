import SwiftUI
import FiHavenCore

/// Budget lens + savings goals for the active period. Income itself is
/// edited on the Income tab; this screen only consumes the total.
struct BudgetView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var editingGoal: SavingsGoal?
    @State private var creatingGoal = false

    private var obligations: Double {
        // Split into named steps: as one chain the type-checker times out.
        let dueBills: [Bill] = store.activeBills
            .filter { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) }
        let billTotal: Double = dueBills.reduce(0) { $0 + $1.amountOrZero }
        let cardTotal: Double = store.activeCards.reduce(0) { $0 + $1.minPaymentOrZero }
        return billTotal + cardTotal
    }
    private var leftover: Double { store.periodIncome - obligations }

    private var budgetLens: BudgetRules.Lens? {
        BudgetRules.lens(
            settings: store.data.settings,
            income: store.periodIncome,
            bills: store.activeBills,
            cards: store.activeCards,
            transactions: store.data.transactions,
            goals: store.data.goals,
            bounds: store.currentBounds,
            billDueInPeriod: { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) },
            isPro: billing.isPro,
            tz: store.tz
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 0) {
                    summaryRow(store.incomeLabel, Money.fmt(store.periodIncome), .positive)
                    Divider().overlay(Theme.border)
                    summaryRow("Bills + minimums", Money.fmt(obligations), .neutral)
                    Divider().overlay(Theme.border)
                    summaryRow("Leftover", Money.fmt(leftover), leftover >= 0 ? .positive : .negative)
                }
                .ctCard(padding: 0)

                if let lens = budgetLens {
                    budgetLensCard(lens)
                }

                HStack {
                    Text("Savings goals")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button { creatingGoal = true } label: { Image(systemName: "plus") }
                        .accessibilityIconButton("Add savings goal")
                }
                .padding(.top, 4)

                if store.data.goals.isEmpty {
                    Text("Saving for an emergency fund, a trip, or a big purchase? Tap + to add a goal.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(store.data.goals) { goal in
                    goalRow(goal).onTapGesture { editingGoal = goal }
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Budget")
        .sheet(isPresented: $creatingGoal) { GoalEditorView(goal: nil) }
        .sheet(item: $editingGoal) { goal in GoalEditorView(goal: goal) }
    }

    private func goalRow(_ g: SavingsGoal) -> some View {
        let sug = Self.suggestedMonthly(g, tz: store.tz)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(g.name.isEmpty ? "Goal" : g.name)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Spacer()
                Text("\(Int(g.progress * 100))%").font(Theme.mono(13)).foregroundStyle(Theme.muted)
            }
            ProgressView(value: g.progress).tint(Theme.green)
                .accessibilityLabel("\(g.name.isEmpty ? "Goal" : g.name) progress")
                .accessibilityValue("\(Int(g.progress * 100)) percent saved")
            HStack {
                Text("\(Money.fmt(g.saved)) of \(Money.fmt(g.target))")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Spacer()
                if let sug {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.green)
                        Text("Save \(Money.fmt(sug))/mo")
                            .font(Theme.ui(12))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .ctCard().contentShape(Rectangle())
    }

    static func suggestedMonthly(_ g: SavingsGoal, tz: TimeZone) -> Double? {
        guard !g.targetDate.isEmpty, g.remaining > 0 else { return nil }
        let m = max(1, DateLogic.monthsUntil(g.targetDate, tz: tz))
        return g.remaining / Double(m)
    }

    @ViewBuilder
    private func budgetLensCard(_ lens: BudgetRules.Lens) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Budget lens").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
            Text(lens.title).font(Theme.ui(16, weight: .semibold)).foregroundStyle(Theme.text)
            Text(lens.subtitle).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            if lens.proLocked {
                Text("Envelope lite is a Pro feature. Upgrade to assign income to goals and category budgets.")
                    .font(Theme.ui(13)).foregroundStyle(Theme.muted)
            } else {
                if let h = lens.headline {
                    HStack {
                        Text(h.label).font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                        Spacer()
                        SemanticAmount(
                            value: Money.fmt(h.amount),
                            tone: A11y.MoneyTone.fromBudgetStatus(h.status),
                            font: Theme.mono(20, weight: .bold),
                            statusWords: A11y.budgetStatusWords(h.status)
                        )
                    }
                    .padding(12)
                    .background((h.status == "ok" ? Theme.green : Theme.red).opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                ForEach(lens.rows, id: \.key) { row in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.label).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                            if let pct = row.pct { Text("\(pct)%").font(Theme.ui(11)).foregroundStyle(Theme.muted) }
                            if let hint = row.hint { Text(hint).font(Theme.ui(11)).foregroundStyle(Theme.muted) }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            if let t = row.target, t != row.actual {
                                Text("target \(Money.fmt(t))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                            }
                            SemanticAmount(
                                value: Money.fmt(row.actual),
                                tone: A11y.MoneyTone.fromBudgetRowStatus(row.status),
                                font: Theme.mono(13),
                                statusWords: A11y.budgetRowStatusWords(row.status)
                            )
                        }
                    }
                    .padding(.vertical, 4)
                }
                ForEach(lens.warnings, id: \.key) { w in
                    Text("\(w.label): \(w.pct, specifier: "%.1f")% of income (≤ \(w.limit)%)\(w.over ? " ⚠" : "")")
                        .font(Theme.ui(11))
                        .foregroundStyle(w.over ? Theme.orange : Theme.muted)
                }
                if lens.mode == "envelope", let env = lens.envelope {
                    envelopeEditor(env)
                }
            }
        }
        .ctCard()
    }

    @ViewBuilder
    private func envelopeEditor(_ env: BudgetRules.EnvelopeAssignments) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider().overlay(Theme.border)
            Text("Assign envelopes").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
            if !store.data.goals.isEmpty {
                Text("Goals").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                ForEach(store.data.goals) { g in
                    envelopeAmountRow(
                        g.name.isEmpty ? "Goal" : g.name,
                        value: env.goalMap[g.id] ?? 0
                    ) { store.setEnvelopeAssignGoal(g.id, $0) }
                }
            }
            Text("Categories").font(Theme.ui(12)).foregroundStyle(Theme.muted)
            ForEach(spendingCategories, id: \.self) { cat in
                envelopeAmountRow(
                    "\(SpendingView.catIcon(cat)) \(cat)",
                    value: env.catMap[cat] ?? 0
                ) { store.setEnvelopeAssignCategory(cat, $0) }
            }
            if store.data.settings.envelopeRollover {
                Text("Unused category amounts roll into the next period.")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .padding(.top, 4)
    }

    private func envelopeAmountRow(_ label: String, value: Double, onChange: @escaping (Double) -> Void) -> some View {
        CurrencyField(label: label, value: Binding(
            get: { value },
            set: { onChange(max(0, $0)) }
        ))
        .font(Theme.ui(13))
        .foregroundStyle(Theme.text)
        .padding(.vertical, 2)
    }

    private func summaryRow(_ label: String, _ value: String, _ tone: A11y.MoneyTone) -> some View {
        HStack {
            Text(label).font(Theme.ui(15)).foregroundStyle(Theme.muted)
            Spacer()
            SemanticAmount(value: value, tone: tone, font: Theme.mono(16, weight: .semibold))
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

}

/// Add/edit a savings goal.
struct GoalEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let goal: SavingsGoal?

    @State private var name = ""
    @State private var target: Double = 0
    @State private var saved: Double = 0
    @State private var hasDate = false
    @State private var date = Date()
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Goal name (e.g. Emergency fund)", text: $name)
                    amountRow("Saved", $saved)
                    amountRow("Target", $target)
                    Toggle("Set a target date", isOn: $hasDate)
                        .accessibilityHint("Adds an optional deadline for this savings goal")
                    if hasDate {
                        DatePicker("Target date", selection: $date, displayedComponents: .date)
                    }
                    TextField("Notes", text: $notes, axis: .vertical)
                }
                if goal != nil {
                    Section {
                        Button("Delete goal", role: .destructive) {
                            if let goal { store.deleteGoal(goal) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(goal == nil ? "New Goal" : "Edit Goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .accessibilityHint("Saves this savings goal")
                }
            }
            .onAppear {
                if let goal {
                    name = goal.name; target = goal.target; saved = goal.saved; notes = goal.notes
                    if !goal.targetDate.isEmpty, let d = DateLogic.parseDate(goal.targetDate, tz: store.tz) {
                        hasDate = true; date = d
                    }
                }
            }
        }
    }

    private func amountRow(_ label: String, _ value: Binding<Double>) -> some View {
        CurrencyField(label: label, value: value)
    }

    private func save() {
        let iso = hasDate ? Self.isoString(date, tz: store.tz) : ""
        store.upsertGoal(SavingsGoal(
            id: goal?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            target: target, saved: saved, targetDate: iso, notes: notes
        ))
        dismiss()
    }

    static func isoString(_ date: Date, tz: TimeZone) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// Add a spending transaction.
struct TransactionEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    /// nil = add a new transaction; non-nil = edit that one.
    var edit: SpendTransaction?

    @State private var amount: Double = 0
    @State private var category = "Groceries"
    @State private var merchant = ""
    @State private var note = ""
    @State private var date = Date()

    var body: some View {
        NavigationStack {
            Form {
                CurrencyField(label: "Amount", value: $amount)
                Picker("Category", selection: $category) {
                    ForEach(spendingCategories, id: \.self) { cat in
                        Text("\(SpendingView.catIcon(cat)) \(cat)")
                            .tag(cat)
                            .accessibilityLabel(cat)
                    }
                }
                TextField("Merchant (optional)", text: $merchant)
                TextField("Note (optional)", text: $note, axis: .vertical)
                DatePicker("Date", selection: $date, displayedComponents: .date)
                if let edit {
                    Section {
                        Button(role: .destructive) {
                            if edit.isBank {
                                store.declineBankTransaction(edit)
                            } else {
                                store.deleteTransaction(edit)
                            }
                            dismiss()
                        } label: {
                            Text(edit.isBank ? "Remove bank purchase" : "Delete transaction")
                        }
                    }
                }
            }
            .navigationTitle(edit == nil ? "Add transaction" : "Edit transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(edit == nil ? "Add" : "Save") {
                        let m = merchant.trimmingCharacters(in: .whitespaces)
                        let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
                        if let edit {
                            store.updateTransaction(id: edit.id, amount: amount, category: category, merchant: m, note: n, date: date)
                        } else {
                            store.addTransaction(amount: amount, category: category, merchant: m, note: n, date: date)
                        }
                        dismiss()
                    }
                    .disabled(amount <= 0)
                    .accessibilityHint(amount <= 0 ? "Enter an amount greater than zero" : "Saves this transaction")
                }
            }
            .onAppear {
                if let edit {
                    amount = edit.amount
                    category = edit.category
                    merchant = edit.merchant
                    note = edit.note
                    date = Self.parseDay(edit.date) ?? Date()
                }
            }
        }
    }

    /// Parse a "YYYY-MM-DD" day string to a Date (local noon avoids TZ drift).
    private static func parseDay(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone.current
        return f.date(from: s)
    }
}

/// Set a monthly spending budget per category.
struct CategoryBudgetsView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Set a monthly spending limit per category. Leave 0 to ignore.")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
                Section {
                    ForEach(spendingCategories, id: \.self) { cat in
                        CurrencyField(label: "\(SpendingView.catIcon(cat)) \(cat)", value: Binding(
                            get: { store.data.settings.categoryBudgets[cat] ?? 0 },
                            set: { store.setCategoryBudget(cat, $0) }
                        ))
                        .accessibilityLabel("\(cat) monthly budget")
                    }
                }
            }
            .navigationTitle("Category budgets").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
