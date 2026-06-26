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
        store.data.bills
            .filter { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) }
            .reduce(0) { $0 + $1.amount }
            + store.data.cards.reduce(0) { $0 + $1.minPayment }
    }
    private var leftover: Double { store.periodIncome - obligations }

    private var budgetLens: BudgetRules.Lens? {
        BudgetRules.lens(
            settings: store.data.settings,
            income: store.periodIncome,
            bills: store.data.bills,
            cards: store.data.cards,
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
                    summaryRow(store.incomeLabel, Money.fmt(store.periodIncome), Theme.green)
                    Divider().overlay(Theme.border)
                    summaryRow("Bills + minimums", Money.fmt(obligations), Theme.text)
                    Divider().overlay(Theme.border)
                    summaryRow("Leftover", Money.fmt(leftover), leftover >= 0 ? Theme.green : Theme.red)
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
            HStack {
                Text("\(Money.fmt(g.saved)) of \(Money.fmt(g.target))")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Spacer()
                if let sug { Text("Save \(Money.fmt(sug))/mo").font(Theme.ui(12)).foregroundStyle(Theme.green) }
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
            Text("\(adj.amount >= 0 ? "+" : "")\(Money.fmt(adj.amount))")
                .font(Theme.mono(15, weight: .medium))
                .foregroundStyle(adj.amount < 0 ? Theme.red : Theme.green)
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
                        Text(Money.fmt(h.amount)).font(Theme.mono(20, weight: .bold))
                            .foregroundStyle(h.status == "ok" ? Theme.green : Theme.red)
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
                            Text(Money.fmt(row.actual)).font(Theme.mono(13))
                                .foregroundStyle(row.status == "ok" ? Theme.green : (row.status == "under" ? Theme.red : Theme.orange))
                        }
                    }
                    .padding(.vertical, 4)
                }
                ForEach(lens.warnings, id: \.key) { w in
                    Text("\(w.label): \(w.pct, specifier: "%.1f")% of income (≤ \(w.limit)%)\(w.over ? " ⚠" : "")")
                        .font(Theme.ui(11))
                        .foregroundStyle(w.over ? Theme.orange : Theme.muted)
                }
            }
        }
        .ctCard()
    }

    private func summaryRow(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack {
            Text(label).font(Theme.ui(15)).foregroundStyle(Theme.muted)
            Spacer()
            Text(value).font(Theme.mono(16, weight: .semibold)).foregroundStyle(color)
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
                    HStack {
                        Text(frequency == "hourly" ? "Hourly rate" : "Amount")
                        Spacer()
                        Text("$").foregroundStyle(Theme.muted)
                        TextField("0", value: $amount, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
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
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
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
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
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
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
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
        HStack {
            Text(label)
            Spacer()
            Text("$").foregroundStyle(Theme.muted)
            TextField("0", value: value, format: .number)
                .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing)
        }
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
    @State private var amount: Double = 0
    @State private var category = "Groceries"
    @State private var merchant = ""
    @State private var date = Date()

    var body: some View {
        NavigationStack {
            Form {
                HStack {
                    Text("Amount"); Spacer(); Text("$").foregroundStyle(Theme.muted)
                    TextField("0", value: $amount, format: .number)
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                Picker("Category", selection: $category) {
                    ForEach(spendingCategories, id: \.self) { Text("\(SpendingView.catIcon($0)) \($0)").tag($0) }
                }
                TextField("Merchant (optional)", text: $merchant)
                DatePicker("Date", selection: $date, displayedComponents: .date)
            }
            .navigationTitle("Add SpendTransaction").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.addTransaction(amount: amount, category: category,
                                             merchant: merchant.trimmingCharacters(in: .whitespaces), date: date)
                        dismiss()
                    }.disabled(amount <= 0)
                }
            }
        }
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
                        HStack {
                            Text("\(SpendingView.catIcon(cat)) \(cat)")
                            Spacer(); Text("$").foregroundStyle(Theme.muted)
                            TextField("0", value: Binding(
                                get: { store.data.settings.categoryBudgets[cat] ?? 0 },
                                set: { store.setCategoryBudget(cat, $0) }
                            ), format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90)
                        }
                    }
                }
            }
            .navigationTitle("Category budgets").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
