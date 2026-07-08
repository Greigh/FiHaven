import SwiftUI
import FiHavenCore

/// Budget lens mode, splits, debt focus, envelope rollover, and category bucket overrides.
struct BudgetRuleSettingsView: View {
    @EnvironmentObject var store: AppStore

    private static let lensModes: [(String, String)] = [
        ("off", "Off"),
        ("50-30-20", "50 / 30 / 20"),
        ("80-20", "80 / 20"),
        ("60-20-20", "60 / 20 / 20"),
        ("70-20-10", "70 / 20 / 10"),
        ("custom", "Custom split"),
        ("obligations-first", "Obligations first"),
        ("debt-focus", "Debt focus"),
        ("envelope", "Envelope lite"),
    ]

    private static let bucketChoices: [(String, String)] = [
        ("", "Default"),
        ("needs", "Needs"),
        ("wants", "Wants"),
        ("save", "Save"),
    ]

    private var mode: String { BudgetRules.mode(from: store.data.settings) }

    var body: some View {
        List {
            Section {
                Picker("Lens", selection: Binding(
                    get: { mode },
                    set: { store.setBudgetRule($0) }
                )) {
                    ForEach(Self.lensModes, id: \.0) { Text($0.1).tag($0.0) }
                }
                .pickerStyle(.menu)
            } footer: {
                Text("Optional budget lens on the Budget tab — split presets, safe-to-spend, debt focus, or envelope lite (Pro). Off by default.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }

            if mode == "custom" {
                Section("Custom split (%)") {
                    splitField("Needs", get: { store.data.settings.budgetRuleSplits.needs }) { store.setBudgetRuleSplits(needs: $0, wants: store.data.settings.budgetRuleSplits.wants, save: store.data.settings.budgetRuleSplits.save) }
                    splitField("Wants", get: { store.data.settings.budgetRuleSplits.wants }) { store.setBudgetRuleSplits(needs: store.data.settings.budgetRuleSplits.needs, wants: $0, save: store.data.settings.budgetRuleSplits.save) }
                    splitField("Save", get: { store.data.settings.budgetRuleSplits.save }) { store.setBudgetRuleSplits(needs: store.data.settings.budgetRuleSplits.needs, wants: store.data.settings.budgetRuleSplits.wants, save: $0) }
                }
            }

            if mode == "debt-focus" {
                Section {
                    CurrencyField(label: "Extra monthly debt payment", value: Binding(
                        get: { store.data.settings.debtFocusExtra },
                        set: { store.setDebtFocusExtra($0) }
                    ))
                } footer: {
                    Text("Planned dollars above minimums — same idea as the Payoff planner extra payment.")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            }

            if mode == "envelope" {
                Section {
                    Toggle("Roll unused category envelopes to the next period", isOn: Binding(
                        get: { store.data.settings.envelopeRollover },
                        set: { store.setEnvelopeRollover($0) }
                    ))
                    .tint(Theme.accent)
                }
            }

            Section {
                Text("Override how bill and spending categories map to needs, wants, or save in split budget lenses. Default uses FiHaven's built-in map.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }

            Section("Bill categories") {
                ForEach(BudgetRules.billCategories, id: \.self) { cat in
                    bucketRow(kind: "bills", category: cat, icon: CTConstants.icon(forCategory: cat))
                }
            }

            Section("Spending categories") {
                ForEach(spendingCategories, id: \.self) { cat in
                    bucketRow(kind: "spending", category: cat, icon: SpendingView.catIcon(cat))
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Budget lens")
    }

    private func splitField(_ label: String, get: @escaping () -> Int, set: @escaping (Int) -> Void) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", value: Binding(
                get: { Double(get()) },
                set: { set(min(100, max(0, Int($0)))) }
            ), format: .number)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 56)
            Text("%").foregroundStyle(Theme.muted)
        }
    }

    private func bucketRow(kind: String, category: String, icon: String) -> some View {
        let current = kind == "bills"
            ? store.data.settings.budgetBucketOverrides.bills[category]
            : store.data.settings.budgetBucketOverrides.spending[category]
        return Picker(selection: Binding(
            get: { current ?? "" },
            set: { store.setBudgetBucketOverride(kind: kind, category: category, bucket: $0.isEmpty ? nil : $0) }
        )) {
            ForEach(Self.bucketChoices, id: \.0) { Text($0.1).tag($0.0) }
        } label: {
            Text("\(icon) \(category)")
        }
        .pickerStyle(.menu)
    }
}
