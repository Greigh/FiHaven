import SwiftUI
import FiHavenCore

/// Income sources editor + monthly budget summary.
struct BudgetView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: IncomeSource?
    @State private var creating = false

    private var obligations: Double {
        store.data.bills.reduce(0) { $0 + $1.amount }
            + store.data.cards.reduce(0) { $0 + $1.minPayment }
    }
    private var leftover: Double { store.monthlyIncome - obligations }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 0) {
                    summaryRow("Monthly income", Money.fmt(store.monthlyIncome), Theme.green)
                    Divider().overlay(Theme.border)
                    summaryRow("Bills + minimums", Money.fmt(obligations), Theme.text)
                    Divider().overlay(Theme.border)
                    summaryRow("Leftover", Money.fmt(leftover), leftover >= 0 ? Theme.green : Theme.red)
                }
                .ctCard(padding: 0)

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
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Budget")
        .sheet(isPresented: $creating) { IncomeEditorView(source: nil) }
        .sheet(item: $editing) { src in IncomeEditorView(source: src) }
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

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Label (e.g. Paycheck)", text: $label)
                    HStack {
                        Text("Amount")
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
                }
            }
        }
    }

    private func save() {
        let saved = IncomeSource(
            id: source?.id ?? "src-\(AppStore.newID())",
            label: label.trimmingCharacters(in: .whitespaces),
            amount: amount,
            frequency: frequency
        )
        store.upsertIncome(saved)
        dismiss()
    }
}
