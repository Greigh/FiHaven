import SwiftUI
import FiHavenCore

/// Income sources editor + monthly budget summary.
struct BudgetView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var editing: IncomeSource?
    @State private var creating = false
    @State private var editingAdj: IncomeAdjustment?
    @State private var creatingAdj = false
    @State private var editingGoal: SavingsGoal?
    @State private var creatingGoal = false

    private var periodAdjustments: [IncomeAdjustment] {
        store.data.settings.incomeAdjustments.filter { $0.applies(to: store.currentPeriodKey) }
    }

    private var obligations: Double {
        store.activeBills
            .filter { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) }
            .reduce(0) { $0 + $1.amount }
            + store.activeCards.reduce(0) { $0 + $1.minPayment }
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
                    Text("Income sources")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .accessibilityIconButton("Add income source")
                }

                if store.data.settings.incomes.isEmpty {
                    Text("No income sources yet. Tap + to add your paycheck.")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(store.data.settings.incomes) { src in
                    incomeRow(src).onTapGesture { editing = src }
                }

                HStack {
                    Text("Adjustments · this month")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button { creatingAdj = true } label: { Image(systemName: "plus") }
                        .accessibilityIconButton("Add income adjustment")
                }
                .padding(.top, 4)

                if periodAdjustments.isEmpty {
                    Text("Bonus, unpaid time off, or a raise? Tap + to add a one-time or recurring change.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(periodAdjustments) { adj in
                    adjustmentRow(adj).onTapGesture { editingAdj = adj }
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
        .task { store.applyEnvelopeRolloverIfNeeded() }
        .sheet(isPresented: $creating) { IncomeEditorView(source: nil) }
        .sheet(item: $editing) { src in IncomeEditorView(source: src) }
        .sheet(isPresented: $creatingAdj) { IncomeAdjustmentEditorView(adjustment: nil, monthKey: store.currentPeriodKey) }
        .sheet(item: $editingAdj) { adj in IncomeAdjustmentEditorView(adjustment: adj, monthKey: store.currentPeriodKey) }
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

    private func adjustmentRow(_ adj: IncomeAdjustment) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(adj.label.isEmpty ? (adj.amount < 0 ? "Reduction" : "Extra income") : adj.label)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Text(adj.kind == "recurring"
                     ? "Monthly from \(DateLogic.monthKeyLabel(adj.startMonth, tz: store.tz))"
                     : "Just \(DateLogic.monthKeyLabel(adj.monthKey, tz: store.tz))")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Spacer()
            SemanticAmount(
                value: "\(adj.amount >= 0 ? "+" : "")\(Money.fmt(adj.amount))",
                tone: adj.amount < 0 ? .negative : .positive,
                font: Theme.mono(15, weight: .medium)
            )
        }
        .ctCard()
        .contentShape(Rectangle())
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

    private func incomeRow(_ src: IncomeSource) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(src.label.isEmpty ? "Income" : src.label)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Text(frequencyLabel(src.frequency))
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.fmt(src.amount)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.text)
                Text("\(Money.fmt(Income.monthly(of: src)))/mo")
                    .font(Theme.mono(10)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
        .contentShape(Rectangle())
    }

    private func frequencyLabel(_ key: String) -> String {
        Income.frequencies.first { $0.key == key }?.label ?? key.capitalized
    }
}

/// Add/edit an income source.
struct IncomeEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let source: IncomeSource?

    @State private var label = ""
    @State private var amount: Double = 0
    @State private var frequency = "biweekly"
    @State private var hoursPerWeek: Double = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Label (e.g. Paycheck)", text: $label)
                    CurrencyField(label: frequency == "hourly" ? "Hourly rate" : "Amount", value: $amount)
                    Picker("Frequency", selection: $frequency) {
                        ForEach(Income.frequencies, id: \.key) { f in
                            Text(f.label).tag(f.key)
                        }
                    }
                    if frequency == "hourly" {
                        HStack {
                            Text("Hours / week")
                            Spacer()
                            TextField("40", value: $hoursPerWeek, format: .number)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        }
                    }
                }
                if source != nil {
                    Section {
                        Button("Delete source", role: .destructive) {
                            if let source { store.deleteIncome(source) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(source == nil ? "New Income" : "Edit Income")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .accessibilityHint("Saves this income source")
                }
            }
            .onAppear {
                if let source {
                    label = source.label; amount = source.amount; frequency = source.frequency
                    hoursPerWeek = source.hoursPerWeek
                }
            }
        }
    }

    private func save() {
        let saved = IncomeSource(
            id: source?.id ?? "src-\(AppStore.newID())",
            label: label.trimmingCharacters(in: .whitespaces),
            amount: amount,
            frequency: frequency,
            hoursPerWeek: frequency == "hourly" ? hoursPerWeek : 0
        )
        store.upsertIncome(saved)
        dismiss()
    }
}

/// Add/edit an income adjustment (bonus / unpaid time off / raise).
struct IncomeAdjustmentEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let adjustment: IncomeAdjustment?
    /// The period this is created for (one-time → that month; recurring → from
    /// that month onward).
    let monthKey: String

    @State private var label = ""
    @State private var amount: Double = 0
    @State private var kind = "once"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Label (e.g. Bonus, Unpaid PTO)", text: $label)
                    HStack {
                        Text("Amount")
                        Spacer()
                        TextField("0", value: $amount, format: .number)
                            .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing)
                    }
                    Picker("Applies", selection: $kind) {
                        Text("Just this month").tag("once")
                        Text("Every month from now").tag("recurring")
                    }
                } footer: {
                    Text("Use a negative amount to reduce income (e.g. unpaid time off). Recurring covers a raise or new ongoing income.")
                }
                if adjustment != nil {
                    Section {
                        Button("Delete adjustment", role: .destructive) {
                            if let adjustment { store.deleteAdjustment(adjustment) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(adjustment == nil ? "New Adjustment" : "Edit Adjustment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .accessibilityHint("Saves this income adjustment")
                }
            }
            .onAppear {
                if let adjustment {
                    label = adjustment.label; amount = adjustment.amount; kind = adjustment.kind
                }
            }
        }
    }

    private func save() {
        let isRecurring = kind == "recurring"
        // Preserve the original anchor month when editing; use the view's
        // month when creating.
        let onceMonth = adjustment?.monthKey.isEmpty == false ? adjustment!.monthKey : monthKey
        let startMonth = adjustment?.startMonth.isEmpty == false ? adjustment!.startMonth : monthKey
        let saved = IncomeAdjustment(
            id: adjustment?.id ?? "adj-\(AppStore.newID())",
            label: label.trimmingCharacters(in: .whitespaces),
            amount: amount,
            kind: kind,
            monthKey: isRecurring ? "" : onceMonth,
            startMonth: isRecurring ? startMonth : "",
            endMonth: isRecurring ? (adjustment?.endMonth ?? "") : ""
        )
        store.upsertAdjustment(saved)
        dismiss()
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
                DatePicker("Date", selection: $date, displayedComponents: .date)
                if let edit {
                    Section {
                        Button(role: .destructive) {
                            store.deleteTransaction(edit); dismiss()
                        } label: { Text("Delete transaction") }
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
                        if let edit {
                            store.updateTransaction(id: edit.id, amount: amount, category: category, merchant: m, date: date)
                        } else {
                            store.addTransaction(amount: amount, category: category, merchant: m, date: date)
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
