import SwiftUI
import FiHavenCore

/// Net Worth tab — assets (the accounts you own) minus liabilities (the
/// non-archived cards and loans you owe). Asset accounts are added and
/// edited here; the debts side comes from the Cards/Loans tabs.
/// Mirrors the web `NetWorthPanel`.
struct NetWorthView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: Account?
    @State private var creating = false

    private static let types: [String: (label: String, icon: String)] = [
        "checking":   ("Checking", "🏦"),
        "savings":    ("Savings", "💰"),
        "investment": ("Investments", "📈"),
        "property":   ("Property", "🏠"),
        "cash":       ("Cash", "💵"),
        "other":      ("Other", "📦"),
    ]
    private func icon(_ t: String) -> String { Self.types[t]?.icon ?? "📦" }
    private func label(_ t: String) -> String { Self.types[t]?.label ?? "Other" }

    var body: some View {
        List {
            summaryCard

            if store.data.accounts.isEmpty {
                HStack {
                    Spacer()
                    Text(store.loaded
                        ? "No accounts yet. Tap + to add savings, checking, investments, or property."
                        : "Loading…")
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                    Spacer()
                }
                .ctCard()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            } else {
                ForEach(store.data.accounts) { account in
                    accountRow(account)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                store.deleteAccount(account)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                editing = account
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Theme.accent)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Net Worth")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityIconButton("Add account")
            }
        }
        .sheet(isPresented: $creating) { AccountEditorView(account: nil) }
        .sheet(item: $editing) { account in AccountEditorView(account: account) }
    }

    // ── Assets − liabilities = net worth ─────────────────────────────
    private var summaryCard: some View {
        let positive = store.netWorth >= 0
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                FieldLabel(text: "Net worth")
                Text(Money.fmt(store.netWorth))
                    .font(Theme.mono(28, weight: .bold))
                    .foregroundStyle(positive ? Theme.green : Theme.red)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Assets").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    Text(Money.fmt(store.assets))
                        .font(Theme.mono(15, weight: .medium))
                        .foregroundStyle(Theme.green)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Debts").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    Text(Money.fmt(store.liabilities))
                        .font(Theme.mono(15, weight: .medium))
                        .foregroundStyle(Theme.red)
                }
            }
        }
        .ctCard(branded: true)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 6, trailing: 16))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Net worth \(Money.fmt(store.netWorth)), assets \(Money.fmt(store.assets)), debts \(Money.fmt(store.liabilities))")
    }

    private func accountRow(_ account: Account) -> some View {
        HStack(spacing: 12) {
            Text(icon(account.type)).font(.system(size: 18))
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name.isEmpty ? label(account.type) : account.name)
                    .font(Theme.ui(15, weight: .semibold))
                    .foregroundStyle(Theme.text)
                Text(label(account.type))
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(Money.fmt(account.balance))
                .font(Theme.mono(16, weight: .semibold))
                .foregroundStyle(Theme.text)
        }
        .ctCard()
        .contentShape(Rectangle())
        .onTapGesture { editing = account }
        .accessibilityElement(children: .contain)
        .accessibilityHint("Double tap to edit")
    }
}
