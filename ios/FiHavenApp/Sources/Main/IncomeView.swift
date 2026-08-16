import SwiftUI
import FiHavenCore

/// Paychecks and this period's income adjustments. Income used to be a pair
/// of sections inside Budget, below the budget lens — it is a destination of
/// its own now, and Budget consumes the total instead of editing it.
struct IncomeView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: IncomeSource?
    @State private var creating = false
    @State private var editingAdj: IncomeAdjustment?
    @State private var creatingAdj = false

    private var periodAdjustments: [IncomeAdjustment] {
        Income.adjustmentsForPeriod(from: store.data.settings, bounds: store.currentBounds, tz: store.tz)
    }

    /// The month a new one-time adjustment belongs to. NOT the period key —
    /// outside calendar mode that is a start *date*, which no adjustment can match.
    private var anchorMonth: String { Income.periodAnchorMonth(store.currentBounds) }

    /// Derived from the total so the three summary rows always reconcile: outside
    /// calendar mode the period's base is the monthly figure prorated by length.
    private var baseIncome: Double { store.periodIncome - adjustmentsTotal }

    private var adjustmentsTotal: Double {
        Income.adjustmentsTotal(from: store.data.settings, bounds: store.currentBounds, tz: store.tz)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 0) {
                    summaryRow(Income.baseIncomeLabel(for: store.periodConfig), Money.fmt(baseIncome), .neutral)
                    Divider().overlay(Theme.border)
                    summaryRow(
                        Income.adjustmentsLabel(for: store.periodConfig),
                        "\(adjustmentsTotal >= 0 ? "+" : "")\(Money.fmt(adjustmentsTotal))",
                        adjustmentsTotal < 0 ? .negative : .positive
                    )
                    Divider().overlay(Theme.border)
                    summaryRow(store.incomeLabel, Money.fmt(store.periodIncome), .positive)
                }
                .ctCard(padding: 0)

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
                    Text(Income.adjustmentsLabel(for: store.periodConfig))
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
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Income")
        .sheet(isPresented: $creating) { IncomeEditorView(source: nil) }
        .sheet(item: $editing) { src in IncomeEditorView(source: src) }
        .sheet(isPresented: $creatingAdj) { IncomeAdjustmentEditorView(adjustment: nil, monthKey: anchorMonth) }
        .sheet(item: $editingAdj) { adj in IncomeAdjustmentEditorView(adjustment: adj, monthKey: anchorMonth) }
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
            // The day a one-time change landed is set on the web; carry it
            // through so editing the label here doesn't erase it.
            date: isRecurring ? "" : (adjustment?.date ?? ""),
            startMonth: isRecurring ? startMonth : "",
            endMonth: isRecurring ? (adjustment?.endMonth ?? "") : ""
        )
        store.upsertAdjustment(saved)
        dismiss()
    }
}
