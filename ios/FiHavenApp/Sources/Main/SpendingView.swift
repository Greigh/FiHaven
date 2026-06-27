import SwiftUI
import FiHavenCore

/// Manual transactions + per-category budgets for the current period.
struct SpendingView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var addingTx = false
    @State private var editingBudgets = false
    @State private var dismissedDupes: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Spending · this period")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    if billing.isPro {
                        Button { editingBudgets = true } label: { Image(systemName: "slider.horizontal.3") }
                            .accessibilityIconButton("Edit category budgets")
                    }
                    Button { addingTx = true } label: { Image(systemName: "plus") }
                        .accessibilityIconButton("Add transaction")
                }

                VStack(spacing: 8) {
                    HStack {
                        Text("Total spent").font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(Money.fmt(store.totalSpent)).font(Theme.mono(15, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                    ForEach(spendingCategories, id: \.self) { cat in
                        let spent = store.spent(category: cat)
                        let budget = store.data.settings.categoryBudgets[cat] ?? 0
                        if spent > 0 || budget > 0 {
                            VStack(spacing: 4) {
                                HStack {
                                    Text("\(Self.catIcon(cat)) \(cat)").font(Theme.ui(13)).foregroundStyle(Theme.text)
                                    Spacer()
                                    HStack(spacing: 6) {
                                        if billing.isPro && budget > 0 && spent > budget {
                                            Text("Over budget")
                                                .font(Theme.ui(10, weight: .medium))
                                                .foregroundStyle(Theme.red)
                                        }
                                        Text(billing.isPro && budget > 0 ? "\(Money.fmt(spent)) / \(Money.fmt(budget))" : Money.fmt(spent))
                                            .font(Theme.mono(12))
                                            .foregroundStyle(Theme.text)
                                    }
                                }
                                if billing.isPro && budget > 0 {
                                    ProgressView(value: min(1, spent / budget))
                                        .tint(spent > budget ? Theme.red : Theme.green)
                                        .accessibilityLabel("\(cat) budget")
                                        .accessibilityValue(
                                            spent > budget
                                                ? "Over budget, \(Money.fmt(spent)) of \(Money.fmt(budget))"
                                                : "\(Money.fmt(spent)) of \(Money.fmt(budget))"
                                        )
                                }
                            }
                        }
                    }
                }
                .ctCard()

                if !reconcilePairs.isEmpty || unconfirmedCount > 0 { reconcilePanel }

                if !store.periodTransactions.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(recentTx.enumerated()), id: \.element.id) { i, tx in
                            if i > 0 { Divider().overlay(Theme.border) }
                            HStack(spacing: 10) {
                                Text(Self.catIcon(tx.category)).font(.system(size: 15))
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 5) {
                                        Text(tx.merchant.isEmpty ? tx.category : tx.merchant)
                                            .font(Theme.ui(13)).foregroundStyle(Theme.text)
                                        if tx.isBank {
                                            Text(tx.pending ? "🏦 pending" : "🏦")
                                                .font(Theme.ui(10)).foregroundStyle(Theme.accent)
                                        }
                                    }
                                    Text(tx.date).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Text(Money.fmt(tx.amount)).font(Theme.mono(13)).foregroundStyle(Theme.text)
                                if !tx.isBank {
                                    Button { store.deleteTransaction(tx) } label: {
                                        Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIconButton("Delete transaction")
                                } else {
                                    Image(systemName: "link").font(.caption2).foregroundStyle(Theme.muted.opacity(0.5))
                                        .accessibilityLabel("Linked bank transaction")
                                }
                            }
                            .padding(.vertical, 7)
                        }
                    }
                    .ctCard()
                } else {
                    Text("Log groceries, dining, and other spending to track where your money goes this period.")
                        .font(Theme.ui(14)).foregroundStyle(Theme.muted).ctCard()
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Spending")
        .sheet(isPresented: $addingTx) { TransactionEditorView() }
        .sheet(isPresented: $editingBudgets) { CategoryBudgetsView() }
    }

    private var recentTx: [SpendTransaction] {
        store.data.transactions.sorted { $0.date > $1.date }.prefix(8).map { $0 }
    }

    // ── Bank-sync reconciliation (only when a bank is linked) ─────────
    private var reconcilePairs: [Reconcile.DuplicatePair] {
        Reconcile.duplicatePairs(store.data.transactions, tz: store.tz)
            .filter { !dismissedDupes.contains($0.bank.id) }
    }
    private var unconfirmedCount: Int {
        store.data.transactions.contains { $0.isBank }
            ? Reconcile.unconfirmedManual(store.data.transactions, tz: store.tz).count : 0
    }

    private var reconcilePanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("🏦 Bank sync review").font(Theme.ui(13, weight: .bold)).foregroundStyle(Theme.text)
            if !reconcilePairs.isEmpty {
                Text("These look like the same purchase entered twice — your entry and a bank import. Keep one.")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                ForEach(reconcilePairs, id: \.bank.id) { pair in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(pair.bank.merchant.isEmpty ? pair.manual.merchant : pair.bank.merchant) · \(Money.fmt(pair.bank.amount))")
                                .font(Theme.ui(13, weight: .medium)).foregroundStyle(Theme.text)
                            Text("you logged \(pair.manual.date) · bank \(pair.bank.date)")
                                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button("Remove mine") { store.deleteTransaction(pair.manual) }
                            .font(Theme.ui(12, weight: .semibold)).buttonStyle(.plain).foregroundStyle(Theme.red)
                        Button("Keep") { dismissedDupes.insert(pair.bank.id) }
                            .font(Theme.ui(12)).buttonStyle(.plain).foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 4)
                }
            }
            if unconfirmedCount > 0 {
                Text("\(unconfirmedCount) recent manual \(unconfirmedCount == 1 ? "entry the bank hasn’t" : "entries the bank hasn’t") corroborated yet — double-check if you expected a bank match.")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
    }

    static func catIcon(_ c: String) -> String {
        switch c {
        case "Groceries": return "🛒"; case "Dining": return "🍽️"; case "Shopping": return "🛍️"
        case "Transport": return "🚗"; case "Entertainment": return "🎬"; case "Health": return "💊"
        case "Bills": return "📄"; default: return "📦"
        }
    }
}
