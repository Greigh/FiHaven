import SwiftUI
import FiHavenCore

/// Manual transactions + per-category budgets for the current period.
struct SpendingView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var addingTx = false
    @State private var editingTx: SpendTransaction?
    @State private var editingBudgets = false
    @State private var dismissedDupes: Set<String> = []
    @State private var searchText = ""

    private var prevBounds: PeriodBounds {
        Period.shift(store.currentBounds, by: -1, config: store.periodConfig, tz: store.tz)
    }

    private var spendingInsights: [SpendingInsights.Row] {
        guard billing.isPro else { return [] }
        return Array(SpendingInsights.compute(
            store.data.transactions,
            currentBounds: store.currentBounds,
            prevBounds: prevBounds
        ).prefix(4))
    }

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

                if billing.isPro && !spendingInsights.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("vs last period")
                            .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                        ForEach(spendingInsights, id: \.cat) { row in
                            HStack {
                                Text("\(Self.catIcon(row.cat)) \(row.cat)")
                                    .font(Theme.ui(13)).foregroundStyle(Theme.text)
                                Spacer()
                                HStack(spacing: 4) {
                                    Text(row.delta >= 0 ? "+\(Money.fmt(row.delta))" : Money.fmt(row.delta))
                                        .font(Theme.mono(12))
                                        .foregroundStyle(row.delta > 0 ? Theme.red : (row.delta < 0 ? Theme.green : Theme.muted))
                                    if row.was > 0 {
                                        Text("(\(row.pct >= 0 ? "+" : "")\(row.pct)%)")
                                            .font(Theme.ui(11))
                                            .foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                        }
                    }
                    .ctCard()
                }

                if !reconcilePairs.isEmpty || unconfirmedCount > 0 { reconcilePanel }

                if !store.periodTransactions.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(recentTx.enumerated()), id: \.element.id) { i, tx in
                            if i > 0 { Divider().overlay(Theme.border) }
                            SpendingRow(
                                tx: tx,
                                onEdit: { editingTx = tx },
                                onDelete: { store.deleteTransaction(tx) },
                                onKeep: { store.acceptBankTransaction(tx) },
                                onDecline: { store.declineBankTransaction(tx) }
                            )
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
        .searchable(text: $searchText, prompt: "Search spending")
        .brandedNavigationBar("Spending")
        .sheet(isPresented: $addingTx) { TransactionEditorView() }
        .sheet(item: $editingTx) { tx in TransactionEditorView(edit: tx) }
        .sheet(isPresented: $editingBudgets) { CategoryBudgetsView() }
    }

    private var recentTx: [SpendTransaction] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.periodTransactions
            .filter { tx in
                if q.isEmpty { return true }
                let hay = [tx.merchant, tx.category, tx.note].joined(separator: " ")
                return hay.localizedCaseInsensitiveContains(q)
            }
            .sorted { $0.date > $1.date }
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

/// Spending list row: title + bank status under the name (not beside the amount),
/// amount alone on the trailing edge, and ≥44pt action controls.
private struct SpendingRow: View {
    let tx: SpendTransaction
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onKeep: () -> Void
    let onDecline: () -> Void

    private var title: String { tx.merchant.isEmpty ? tx.category : tx.merchant }

    private var subtitle: String {
        var parts = [tx.date]
        if tx.isBank { parts.append(tx.pending ? "Bank · pending" : "Bank") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(SpendingView.catIcon(tx.category))
                .font(.system(size: 15))
                .frame(width: 22, alignment: .center)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(subtitle)
                    .font(Theme.ui(11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(Money.fmt(tx.amount))
                .font(Theme.mono(13))
                .foregroundStyle(Theme.text)
                .padding(.top, 2)

            HStack(spacing: 2) {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIconButton("Edit transaction")

                if tx.isBank && tx.pending {
                    Button(action: onKeep) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Keep pending bank transaction")
                }

                Button(action: { if tx.isBank { onDecline() } else { onDelete() } }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tx.isBank
                    ? "Not mine — remove and don’t import again"
                    : "Delete transaction")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .padding(.vertical, 4)
    }
}
